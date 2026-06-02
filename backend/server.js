const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { sequelize, User, EngineerProfile, DraftProfile, Project, FloorZone, TaskHistoryLog, Setting } = require('./models');

try {
  require('dotenv').config();
} catch (e) {
  // Silent catch if dotenv is not installed yet
}

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'syncdraft-super-secret-key-123456';

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.options('*', cors()); // Handle preflight
app.use(express.json());

// ==================== CRYPTO & AUTH HELPERS ====================

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, storedHash) {
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === storedHash;
}

function generateToken(user) {
  const payload = JSON.stringify({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours validity
  });
  const cipher = crypto.createCipheriv('aes-256-cbc', crypto.scryptSync(JWT_SECRET, 'salt', 32), Buffer.alloc(16, 0));
  let encrypted = cipher.update(payload, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function verifyToken(token) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.scryptSync(JWT_SECRET, 'salt', 32), Buffer.alloc(16, 0));
    let decrypted = decipher.update(token, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    const data = JSON.parse(decrypted);
    if (data.exp < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// ==================== AUTH MIDDLEWARES ====================

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
  req.user = decoded;
  next();
}

function requireAdmin(req, res, next) {
  authenticate(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    next();
  });
}

// Helper to calculate Dynamic Delay Risk
function getDelayRisk(floorZone, warningDays = 2) {
  if (isCompletedStatus(floorZone.status)) {
    return 'Normal';
  }
  if (!floorZone.deadline) {
    return 'Normal';
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const deadline = new Date(floorZone.deadline);
  deadline.setHours(0, 0, 0, 0);

  if (today > deadline) {
    return 'OVERDUE';
  }

  const diffTime = deadline - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= warningDays) {
    return 'RISK';
  }

  return 'Normal';
}

// Get workload settings helper
async function getWorkloadSettings() {
  const settings = await Setting.findAll();
  const settingsMap = settings.reduce((acc, s) => {
    acc[s.key] = s.value;
    return acc;
  }, {});

  return {
    hoursPerSheet: parseFloat(settingsMap.hoursPerSheet || '1.5'),
    maxSheetsThreshold: parseInt(settingsMap.maxSheetsThreshold || '5'),
    warningDaysThreshold: parseInt(settingsMap.warningDaysThreshold || '2')
  };
}

function normalizeNullableDate(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function isCompletedStatus(status) {
  return status === 'มีแบบ Shop แล้ว' || status === 'ออกของแล้ว';
}

function isReadyForShopStatus(status) {
  return status === 'พร้อมทำ Shop';
}

function getNaturalFloorSortValue(name) {
  const text = String(name || '');
  const match = text.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return Number.MAX_SAFE_INTEGER;
}

function compareFloorZones(a, b) {
  const aNum = getNaturalFloorSortValue(a.name);
  const bNum = getNaturalFloorSortValue(b.name);
  if (aNum !== bNum) return aNum - bNum;
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function hydrateFloorZones(floorZones) {
  if (!Array.isArray(floorZones)) return [];

  const plain = floorZones.map(fz => {
    const item = fz.get ? fz.get({ plain: true }) : { ...fz };
    if (Array.isArray(item.subZones)) {
      item.subZones = item.subZones
        .map(child => (child.get ? child.get({ plain: true }) : { ...child }))
        .sort(compareFloorZones);
    }
    return item;
  });

  return plain.sort(compareFloorZones);
}

function buildFloorZoneDeleteOrder(floorZones) {
  const byParent = new Map();
  for (const zone of floorZones) {
    const parentId = zone.parentZoneId || 0;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(zone);
  }

  const ordered = [];
  const walk = (parentId) => {
    const children = byParent.get(parentId) || [];
    children.sort((a, b) => compareFloorZones(a, b));
    for (const child of children) {
      walk(child.id);
      ordered.push(child);
    }
  };

  walk(0);
  return ordered;
}

async function deleteProjectFloorZones(projectId, transaction) {
  const floorZones = await FloorZone.findAll({
    where: { projectId },
    attributes: ['id', 'parentZoneId'],
    transaction
  });

  if (!floorZones.length) return;

  const deleteOrder = buildFloorZoneDeleteOrder(floorZones);
  const floorZoneIds = deleteOrder.map(zone => zone.id);

  await TaskHistoryLog.destroy({
    where: { floorZoneId: floorZoneIds },
    transaction
  });

  for (const zone of deleteOrder) {
    await FloorZone.destroy({
      where: { id: zone.id },
      transaction
    });
  }
}

// ==================== API ROUTES ====================

// 1. POST /api/auth/login - Authentication Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const isValid = verifyPassword(password, user.salt, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. GET /api/settings - Fetch current workload config (Public/Authenticated)
app.get('/api/settings', async (req, res) => {
  try {
    const config = await getWorkloadSettings();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. PUT /api/settings - Update workload config (Admin Only)
app.put('/api/settings', requireAdmin, async (req, res) => {
  try {
    const { hoursPerSheet, maxSheetsThreshold, warningDaysThreshold } = req.body;

    if (hoursPerSheet !== undefined) {
      await Setting.upsert({ key: 'hoursPerSheet', value: String(hoursPerSheet) });
    }
    if (maxSheetsThreshold !== undefined) {
      await Setting.upsert({ key: 'maxSheetsThreshold', value: String(maxSheetsThreshold) });
    }
    if (warningDaysThreshold !== undefined) {
      await Setting.upsert({ key: 'warningDaysThreshold', value: String(warningDaysThreshold) });
    }

    const updated = await getWorkloadSettings();
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 4. GET /api/users - Get all users (Authenticated)
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'role'],
      include: [
        { model: EngineerProfile, as: 'engineerProfile' },
        { model: DraftProfile, as: 'draftProfile' }
      ]
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. GET /api/dashboard - Summary analytics & workload matrices (Authenticated)
app.get('/api/dashboard', authenticate, async (req, res) => {
  try {
    const config = await getWorkloadSettings();
    const projects = await Project.findAll({
      include: [{ model: FloorZone, as: 'floorZones', where: { isDeleted: false }, required: false }]
    });

    // KPI Counts
    let totalFloors = 0;
    let activeFloors = 0;
    let overdueFloors = 0;
    let completedFloors = 0;

    projects.forEach(proj => {
      if (!proj.isArchived && proj.floorZones) {
        proj.floorZones.forEach(fz => {
          totalFloors++;
          const risk = getDelayRisk(fz, config.warningDaysThreshold);
          if (fz.status === 'มีแบบ Shop แล้ว' || fz.status === 'ออกของแล้ว') {
            completedFloors++;
          } else {
            activeFloors++;
            if (risk === 'OVERDUE') {
              overdueFloors++;
            }
          }
        });
      }
    });

    const engineers = await User.findAll({ where: { role: 'engineer' } });
    const drafts = await User.findAll({ where: { role: 'draft' }, include: [{ model: DraftProfile, as: 'draftProfile' }] });

    // Draft Workloads
    const draftWorkloads = drafts.map(draft => {
      const draftFloors = [];
      projects
        .filter(p => !p.isArchived)
        .forEach(p => {
          if (!p.floorZones) return;
          p.floorZones.forEach(fz => {
            const ownerDraftId = fz.assignedDraftId || p.draftId;
            if (ownerDraftId === draft.id && !fz.isDeleted) {
              draftFloors.push(fz);
            }
          });
        });

      const activeList = draftFloors.filter(fz => fz.status !== 'มีแบบ Shop แล้ว' && fz.status !== 'ออกของแล้ว');
      const completedList = draftFloors.filter(fz => fz.status === 'มีแบบ Shop แล้ว' || fz.status === 'ออกของแล้ว');
      const activeSheetsCount = activeList.reduce((sum, fz) => sum + fz.sheetCount, 0);
      const totalEstimatedHours = activeSheetsCount * config.hoursPerSheet;
      const overdueListCount = activeList.filter(fz => getDelayRisk(fz, config.warningDaysThreshold) === 'OVERDUE').length;

      return {
        id: draft.id,
        name: draft.name,
        email: draft.email,
        totalFloors: draftFloors.length,
        activeFloors: activeList.length,
        completedFloors: completedList.length,
        activeSheets: activeSheetsCount,
        estimatedHours: parseFloat(totalEstimatedHours.toFixed(1)),
        overdueFloors: overdueListCount,
        avgDelay: draft.draftProfile ? draft.draftProfile.avgDelay : 0.0
      };
    });

    // Engineer Workloads
    const engineerWorkloads = engineers.map(eng => {
      const engProjects = projects.filter(p => p.engineerId === eng.id && !p.isArchived);
      const engFloors = [];
      engProjects.forEach(p => {
        if (p.floorZones) engFloors.push(...p.floorZones.filter(fz => !fz.isDeleted));
      });

      const activeList = engFloors.filter(fz => fz.status !== 'มีแบบ Shop แล้ว' && fz.status !== 'ออกของแล้ว');
      const completedList = engFloors.filter(fz => fz.status === 'มีแบบ Shop แล้ว' || fz.status === 'ออกของแล้ว');
      const activeSheetsCount = activeList.reduce((sum, fz) => sum + fz.sheetCount, 0);
      const overdueListCount = activeList.filter(fz => getDelayRisk(fz, config.warningDaysThreshold) === 'OVERDUE').length;

      return {
        id: eng.id,
        name: eng.name,
        email: eng.email,
        projectsCount: engProjects.length,
        totalFloors: engFloors.length,
        activeFloors: activeList.length,
        completedFloors: completedList.length,
        activeSheets: activeSheetsCount,
        overdueFloors: overdueListCount
      };
    });

    res.json({
      stats: {
        totalFloors,
        activeFloors,
        overdueFloors,
        completedFloors
      },
      draftWorkloads,
      engineerWorkloads
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. GET /api/projects - Get all active projects (Authenticated)
app.get('/api/projects', authenticate, async (req, res) => {
  try {
    const config = await getWorkloadSettings();
    const projects = await Project.findAll({
      where: { isArchived: false },
      include: [
        { model: User, as: 'engineer', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'draft', attributes: ['id', 'name', 'email'] },
        { 
          model: FloorZone, 
          as: 'floorZones', 
          where: { isDeleted: false },
          required: false,
          include: [
            { model: User, as: 'assignedDraft', attributes: ['id', 'name', 'email'] },
            { model: FloorZone, as: 'subZones', where: { isDeleted: false }, required: false, include: [{ model: User, as: 'assignedDraft', attributes: ['id', 'name', 'email'] }] }
          ]
        }
      ],
      order: [['id', 'DESC']]
    });

    const projectsWithRisk = projects.map(proj => {
      const plainProj = proj.get({ plain: true });
      if (plainProj.floorZones) {
        plainProj.floorZones = hydrateFloorZones(plainProj.floorZones).map(fz => {
          fz.delayRisk = fz.deadline ? getDelayRisk(fz, config.warningDaysThreshold) : 'Normal';
          fz.estimatedHours = fz.sheetCount * config.hoursPerSheet;
          return fz;
        });
      }
      return plainProj;
    });

    res.json(projectsWithRisk);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. GET /api/projects/archived - Restoration desk loader (Authenticated)
app.get('/api/projects/archived', authenticate, async (req, res) => {
  try {
    const archivedProjects = await Project.findAll({
      where: { isArchived: true },
      include: [{ model: User, as: 'engineer', attributes: ['id', 'name'] }]
    });

    const softDeletedFloors = await FloorZone.findAll({
      where: { isDeleted: true },
      include: [{ 
        model: Project, 
        as: 'project', 
        include: [{ model: User, as: 'engineer', attributes: ['name'] }]
      }]
    });

    res.json({
      archivedProjects,
      softDeletedFloors
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. POST /api/projects - Create a new project (Authenticated)
app.post('/api/projects', authenticate, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { projectNumber, projectName, engineerId, draftId, notes, floorZones } = req.body;
    
    // Default sheetCount is 1
    const project = await Project.create({ projectNumber, projectName, engineerId, draftId, notes }, { transaction });

    if (floorZones && floorZones.length > 0) {
      for (const fz of floorZones) {
        const createdFz = await FloorZone.create({
          projectId: project.id,
          name: fz.name,
          sheetCount: parseInt(fz.sheetCount) || 1, // Default 1
          deadline: normalizeNullableDate(fz.deadline),
          status: 'รอ Framing',
          notes: fz.notes,
          assignedDraftId: fz.assignedDraftId ? parseInt(fz.assignedDraftId) : null,
          parentZoneId: fz.parentZoneId ? parseInt(fz.parentZoneId) : null
        }, { transaction });

        await TaskHistoryLog.create({
          floorZoneId: createdFz.id,
          oldStatus: null,
          newStatus: 'รอ Framing',
          changedByUserId: req.user.id
        }, { transaction });
      }
    }

    await transaction.commit();
    res.status(201).json(project);
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ error: error.message });
  }
});

// 9. POST /api/projects/:id/floor-zones - Add inline floor zone (Authenticated)
app.post('/api/projects/:id/floor-zones', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sheetCount, deadline, notes, assignedDraftId, parentZoneId } = req.body;

    const createdFz = await FloorZone.create({
      projectId: parseInt(id),
      name,
      sheetCount: parseInt(sheetCount) || 1, // Default 1
      deadline: normalizeNullableDate(deadline),
      status: 'รอ Framing',
      notes,
      assignedDraftId: assignedDraftId ? parseInt(assignedDraftId) : null,
      parentZoneId: parentZoneId ? parseInt(parentZoneId) : null
    });

    await TaskHistoryLog.create({
      floorZoneId: createdFz.id,
      oldStatus: null,
      newStatus: 'รอ Framing',
      changedByUserId: req.user.id
    });

    res.status(201).json(createdFz);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 10. PUT /api/floor-zones/:id/delete - Soft delete floor (Authenticated)
app.put('/api/floor-zones/:id/delete', authenticate, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { isDeleted } = req.body;
    const fz = await FloorZone.findByPk(id, { transaction });

    if (!fz) return res.status(404).json({ error: 'Floor not found' });

    const deleted = isDeleted !== undefined ? Boolean(isDeleted) : true;
    await fz.update({ isDeleted: deleted }, { transaction });

    await TaskHistoryLog.create({
      floorZoneId: fz.id,
      oldStatus: fz.status,
      newStatus: deleted ? 'SOFT_DELETED' : 'RESTORED',
      changedByUserId: req.user.id
    }, { transaction });

    await transaction.commit();
    res.json(fz);
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ error: error.message });
  }
});

// 11. POST /api/floor-zones/:id/split - Split a Floor/Zone (Authenticated)
app.post('/api/floor-zones/:id/split', authenticate, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { newZoneSuffix, splitSheetsCount, assignedDraftId } = req.body;

    const originalFloor = await FloorZone.findByPk(id, { transaction });
    if (!originalFloor) {
      return res.status(404).json({ error: 'Original Floor not found' });
    }

    const currentSheets = originalFloor.sheetCount;
    if (splitSheetsCount >= currentSheets) {
      return res.status(400).json({ error: 'Cannot split more sheets than currently available.' });
    }

    await originalFloor.update({
      sheetCount: currentSheets - splitSheetsCount
    }, { transaction });

    const splitFloor = await FloorZone.create({
      projectId: originalFloor.projectId,
      name: `${originalFloor.name} - ${newZoneSuffix || 'Zone B'}`,
      sheetCount: splitSheetsCount,
      deadline: originalFloor.deadline,
      status: originalFloor.status,
      notes: `Split from ${originalFloor.name}`,
      parentZoneId: originalFloor.id,
      assignedDraftId: assignedDraftId ? parseInt(assignedDraftId) : (originalFloor.assignedDraftId || null)
    }, { transaction });

    await TaskHistoryLog.create({
      floorZoneId: splitFloor.id,
      oldStatus: null,
      newStatus: originalFloor.status,
      changedByUserId: req.user.id
    }, { transaction });

    await transaction.commit();
    res.status(201).json({ original: originalFloor, split: splitFloor });
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ error: error.message });
  }
});

// 12. PUT /api/projects/:id/archive - Archive/Close project (Authenticated)
app.put('/api/projects/:id/archive', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { isArchived } = req.body;
    const project = await Project.findByPk(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await project.update({ isArchived: isArchived !== undefined ? isArchived : true });
    res.json(project);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 13. PUT /api/floor-zones/:id - Modify floor details or status (Authenticated)
app.put('/api/floor-zones/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const floorZone = await FloorZone.findByPk(id);

    if (!floorZone) {
      return res.status(404).json({ error: 'Floor/Zone not found' });
    }

    const oldStatus = floorZone.status;
    const { name, sheetCount, deadline, status, notes, assignedDraftId, parentZoneId } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (sheetCount !== undefined) updateData.sheetCount = parseInt(sheetCount);
    if (deadline !== undefined) updateData.deadline = normalizeNullableDate(deadline);
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) {
      if (req.user.role === 'draft' && notes !== floorZone.notes) {
        return res.status(403).json({ error: 'Forbidden: Draft users cannot edit notes.' });
      }
      updateData.notes = notes;
    }
    if (assignedDraftId !== undefined) updateData.assignedDraftId = assignedDraftId ? parseInt(assignedDraftId) : null;
    if (parentZoneId !== undefined) updateData.parentZoneId = parentZoneId ? parseInt(parentZoneId) : null;

    await floorZone.update(updateData);

    if (status && status !== oldStatus) {
      await TaskHistoryLog.create({
        floorZoneId: floorZone.id,
        oldStatus: oldStatus,
        newStatus: status,
        changedByUserId: req.user.id
      });
    }

    res.json(floorZone);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 14. GET /api/floor-zones/:id/history - Floor history logs (Authenticated)
app.get('/api/floor-zones/:id/history', authenticate, async (req, res) => {
  try {
    const logs = await TaskHistoryLog.findAll({
      where: { floorZoneId: req.params.id },
      include: [{ model: User, as: 'changedByUser', attributes: ['id', 'name', 'role'] }],
      order: [['timestamp', 'DESC']]
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== DELETE PROJECT (Admin & Owning Engineer Only) ====================

app.delete('/api/projects/:id', authenticate, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const project = await Project.findByPk(id, { transaction });

    if (!project) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Project not found' });
    }

    // Access control: Admin OR the engineer who created the project
    if (req.user.role !== 'admin' && req.user.id !== project.engineerId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this project.' });
    }

    await deleteProjectFloorZones(project.id, transaction);
    await project.destroy({ transaction });
    await transaction.commit();
    res.json({ message: `Project ${id} and all its floor zones and log trails deleted successfully.` });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN BACK-OFFICE USER CRUD ====================

// 1. GET /api/admin/users - Get all users with all attributes (Admin Only)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'role']
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. POST /api/admin/users - Create User (Admin Only)
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { name, email, role, password } = req.body;
    if (!name || !email || !role || !password) {
      return res.status(400).json({ error: 'Please supply all user parameters (name, email, role, password).' });
    }

    // Check duplicate email
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const { salt, hash } = hashPassword(password);
    const user = await User.create({
      name,
      email,
      role,
      passwordHash: hash,
      salt
    }, { transaction });

    // Seed profile based on role
    if (role === 'engineer') {
      await EngineerProfile.create({ userId: user.id, avgDelay: 0 }, { transaction });
    } else if (role === 'draft') {
      await DraftProfile.create({ userId: user.id, avgDelay: 0 }, { transaction });
    }

    await transaction.commit();
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ error: error.message });
  }
});

// 3. PUT /api/admin/users/:id - Update User details & Reset Password (Admin Only)
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { name, email, role, password } = req.body;
    const user = await User.findByPk(id, { transaction });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldRole = user.role;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    
    if (role !== undefined && role !== oldRole) {
      updateData.role = role;
      
      // Clean up previous profile & build new one
      if (oldRole === 'engineer') {
        await EngineerProfile.destroy({ where: { userId: user.id }, transaction });
      } else if (oldRole === 'draft') {
        await DraftProfile.destroy({ where: { userId: user.id }, transaction });
      }

      if (role === 'engineer') {
        await EngineerProfile.create({ userId: user.id, avgDelay: 0 }, { transaction });
      } else if (role === 'draft') {
        await DraftProfile.create({ userId: user.id, avgDelay: 0 }, { transaction });
      }
    }

    // Password reset capability
    if (password) {
      const { salt, hash } = hashPassword(password);
      updateData.passwordHash = hash;
      updateData.salt = salt;
    }

    await user.update(updateData, { transaction });
    await transaction.commit();

    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ error: error.message });
  }
});

// 4. DELETE /api/admin/users/:id - Secure Delete User (Admin Only)
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, { transaction });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Do not delete last admin
    if (user.role === 'admin') {
      const adminCount = await User.count({ where: { role: 'admin' }, transaction });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the final administrator user.' });
      }
    }

    // Cascade remove profiles
    if (user.role === 'engineer') {
      await EngineerProfile.destroy({ where: { userId: user.id }, transaction });
    } else if (user.role === 'draft') {
      await DraftProfile.destroy({ where: { userId: user.id }, transaction });
    }

    await user.destroy({ transaction });
    await transaction.commit();

    res.json({ message: `User ${id} has been deleted from SyncDraft database.` });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
});

// ==================== SERVE FRONTEND (LAN / Production) ====================

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');

// Serve static files from React build
app.use(express.static(frontendDist));

// SPA fallback — let React Router handle all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// ==================== AUTO SEED ON FIRST RUN ====================

async function autoSeedIfEmpty() {
  const userCount = await User.count();
  if (userCount > 0) {
    console.log(`✅ Database ready — ${userCount} users found, skipping seed.`);
    return;
  }

  console.log('🌱 Empty database detected — auto-seeding default data...');

  // Seed Settings
  await Setting.bulkCreate([
    { key: 'hoursPerSheet', value: '1.5' },
    { key: 'maxSheetsThreshold', value: '5' },
    { key: 'warningDaysThreshold', value: '2' }
  ]);

  // Seed Users
  const rawUsers = [
    { name: 'ศุภฤกษ์ ตรงจิตสุนทร',      email: 'supharoek@syncdraft.com',    role: 'engineer', password: '123456' },
    { name: 'มงคล นุชไพโรจน์',           email: 'mongkol@syncdraft.com',      role: 'engineer', password: '123456' },
    { name: 'ณภศก ตรีฤกษ์ฤทธิ์',        email: 'naphasok@syncdraft.com',     role: 'engineer', password: '123456' },
    { name: 'กาญยานุช โพธิ์คุ้ม',        email: 'kanyanuch@syncdraft.com',    role: 'engineer', password: '123456' },
    { name: 'เจษฎา เทิ่มมณี',           email: 'jetsada@syncdraft.com',      role: 'engineer', password: '123456' },
    { name: 'ภาณุวัฒน์ ดวงเดือน',        email: 'panuwat@syncdraft.com',      role: 'engineer', password: '123456' },
    { name: 'ปฐพล ฤทธิ์ธรรมนาถ',        email: 'pataphol@syncdraft.com',     role: 'engineer', password: '123456' },
    { name: 'อนุชิต กลั่นอักโข',         email: 'anuchit@syncdraft.com',      role: 'draft',    password: '123456' },
    { name: 'ภรรคพงษ์ วรรณรัตน์',       email: 'phakkaphong@syncdraft.com',  role: 'draft',    password: '123456' },
    { name: 'สมพงษ์ บัวทอง',            email: 'somphong@syncdraft.com',     role: 'draft',    password: '123456' },
    { name: 'ณัฐกานต์ เจริญสัตย์',      email: 'natthakan@syncdraft.com',    role: 'draft',    password: '123456' },
    { name: 'โรเบิร์ต อิกเนทิอัส ชไรเนอร์', email: 'robert@syncdraft.com', role: 'draft',    password: '123456' },
    { name: 'นัฐกรณ์ มีศรี',             email: 'natthakorn@syncdraft.com',   role: 'draft',    password: '123456' },
    { name: 'ผู้ดูแลระบบ (Admin)',        email: 'admin@syncdraft.com',        role: 'admin',    password: 'admin123' },
  ];

  const usersToCreate = rawUsers.map(u => {
    const { salt, hash } = hashPassword(u.password);
    return { name: u.name, email: u.email, role: u.role, passwordHash: hash, salt };
  });

  const createdUsers = await User.bulkCreate(usersToCreate);

  // Seed Profiles
  for (const u of createdUsers) {
    if (u.role === 'engineer') {
      await EngineerProfile.create({ userId: u.id, avgDelay: 1.2 });
    } else if (u.role === 'draft') {
      await DraftProfile.create({ userId: u.id, avgDelay: 0.8 });
    }
  }

  console.log('✅ Auto-seed complete!');
  console.log('   👤 Admin:    admin@syncdraft.com   / admin123');
  console.log('   👤 Engineer: supharoek@syncdraft.com / 123456');
  console.log('   👤 Draft:    anuchit@syncdraft.com   / 123456');
}

// ==================== APP BOOTSTRAP ====================

async function bootstrap() {
  await sequelize.query('PRAGMA foreign_keys = ON;');
  await sequelize.query('PRAGMA journal_mode = WAL;');
  await sequelize.query('PRAGMA busy_timeout = 5000;');
  await sequelize.sync();
  await autoSeedIfEmpty();
  app.listen(PORT, '0.0.0.0', () => {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║       SyncDraft Server — RUNNING ✅           ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Local:   http://localhost:${PORT}               ║`);
    console.log(`║  Network: http://<your-ip>:${PORT}               ║`);
    console.log('║  (เครื่องอื่นใน LAN พิมพ์ IP นี้ใน browser)    ║');
    console.log('╚══════════════════════════════════════════════╝');
  });
}

bootstrap().catch(err => {
  console.error('Unable to sync db & start server:', err);
});
