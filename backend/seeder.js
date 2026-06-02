const { sequelize, User, EngineerProfile, DraftProfile, Project, FloorZone, TaskHistoryLog, Setting } = require('./models');
const crypto = require('crypto');

// Helper to hash passwords using built-in crypto module (Windows and server friendly)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

async function seed() {
  try {
    console.log('Syncing database...');
    await sequelize.sync({ force: true });
    console.log('Database synced successfully.');

    // 1. Seed Dynamic Settings
    console.log('Seeding settings...');
    await Setting.bulkCreate([
      { key: 'hoursPerSheet', value: '1.5' },
      { key: 'maxSheetsThreshold', value: '5' },
      { key: 'warningDaysThreshold', value: '2' }
    ]);

    // 2. Seed Users (Engineers, Drafts, Admins)
    console.log('Seeding users with hashed passwords...');
    const rawUsers = [
      { name: 'ศุภฤกษ์ ตรงจิตสุนทร', email: 'supharoek@syncdraft.com', role: 'engineer', password: '123456' },
      { name: 'มงคล นุชไพโรจน์', email: 'mongkol@syncdraft.com', role: 'engineer', password: '123456' },
      { name: 'ณภศก ตรีฤกษ์ฤทธิ์', email: 'naphasok@syncdraft.com', role: 'engineer', password: '123456' },
      { name: 'กาญยานุช โพธิ์คุ้ม', email: 'kanyanuch@syncdraft.com', role: 'engineer', password: '123456' },
      { name: 'เจษฎา เทิ่มมณี', email: 'jetsada@syncdraft.com', role: 'engineer', password: '123456' },
      { name: 'ภาณุวัฒน์ ดวงเดือน', email: 'panuwat@syncdraft.com', role: 'engineer', password: '123456' },
      { name: 'ปฐพล ฤทธิ์ธรรมนาถ', email: 'pataphol@syncdraft.com', role: 'engineer', password: '123456' },
      { name: 'อนุชิต กลั่นอักโข', email: 'anuchit@syncdraft.com', role: 'draft', password: '123456' },
      { name: 'ภรรคพงษ์ วรรณรัตน์', email: 'phakkaphong@syncdraft.com', role: 'draft', password: '123456' },
      { name: 'สมพงษ์ บัวทอง', email: 'somphong@syncdraft.com', role: 'draft', password: '123456' },
      { name: 'ณัฐกานต์ เจริญสัตย์', email: 'natthakan@syncdraft.com', role: 'draft', password: '123456' },
      { name: 'โรเบิร์ต อิกเนทิอัส ชไรเนอร์', email: 'robert@syncdraft.com', role: 'draft', password: '123456' },
      { name: 'นัฐกรณ์ มีศรี', email: 'natthakorn@syncdraft.com', role: 'draft', password: '123456' },
      // Admin Account
      { name: 'ผู้ดูแลระบบ (Admin)', email: 'admin@syncdraft.com', role: 'admin', password: 'admin123' },
    ];

    const usersToCreate = rawUsers.map(u => {
      const { salt, hash } = hashPassword(u.password);
      return {
        name: u.name,
        email: u.email,
        role: u.role,
        passwordHash: hash,
        salt: salt
      };
    });

    const createdUsers = await User.bulkCreate(usersToCreate);

    // 3. Seed Engineer and Draft Profiles
    console.log('Seeding profiles...');
    for (const u of createdUsers) {
      if (u.role === 'engineer') {
        await EngineerProfile.create({ userId: u.id, avgDelay: 1.2 });
      } else if (u.role === 'draft') {
        await DraftProfile.create({ userId: u.id, avgDelay: 0.8 });
      }
    }

    // Get specific users for projects
    const engSupharoek = createdUsers.find(u => u.name === 'ศุภฤกษ์ ตรงจิตสุนทร');
    const engMongkol = createdUsers.find(u => u.name === 'มงคล นุชไพโรจน์');
    const drAnuchit = createdUsers.find(u => u.name === 'อนุชิต กลั่นอักโข');
    const drPhakkaphong = createdUsers.find(u => u.name === 'ภรรคพงษ์ วรรณรัตน์');
    const drSomphong = createdUsers.find(u => u.name === 'สมพงษ์ บัวทอง');

    const today = new Date();
    const formatDate = (date) => date.toISOString().split('T')[0];
    const addDays = (days) => {
      const d = new Date();
      d.setDate(today.getDate() + days);
      return formatDate(d);
    };

    // 4. Seed Projects
    console.log('Seeding projects...');
    const projectsData = [
      {
        projectNumber: 'P2601',
        projectName: 'Grand Valley Condominium',
        engineerId: engSupharoek.id,
        draftId: drAnuchit.id,
        notes: 'Priority high quality drawings for framing works.'
      },
      {
        projectNumber: 'P2602',
        projectName: 'Ocean Breeze Villa',
        engineerId: engMongkol.id,
        draftId: drPhakkaphong.id,
        notes: 'Luxury residential villa design requirements.'
      },
      {
        projectNumber: 'P2603',
        projectName: 'Smart Office Plaza',
        engineerId: engSupharoek.id,
        draftId: drSomphong.id,
        notes: 'Commercial multi-story office building.'
      }
    ];

    const createdProjects = [];
    for (const p of projectsData) {
      const cp = await Project.create(p);
      createdProjects.push(cp);
    }

    // 5. Seed FloorZones under Projects
    console.log('Seeding floor zones...');
    const floorZonesData = [
      // Project P2601 FloorZones
      {
        projectId: createdProjects[0].id,
        name: 'Floor 1 - Zone A',
        sheetCount: 5,
        deadline: addDays(10),
        status: 'กำลังทำ Shop',
        notes: 'Contains primary HVAC framing layouts.'
      },
      {
        projectId: createdProjects[0].id,
        name: 'Floor 1 - Zone B',
        sheetCount: 1, // Default 1 sheet
        deadline: addDays(12),
        status: 'พร้อมทำ Shop',
        notes: 'Awaiting structural details check.'
      },
      {
        projectId: createdProjects[0].id,
        name: 'Floor 2 - Zone A',
        sheetCount: 6,
        deadline: addDays(1), // RISK (within 2 days)
        status: 'รอ Framing',
        notes: 'Basic outline drafted.'
      },
      {
        projectId: createdProjects[0].id,
        name: 'Floor 2 - Zone B',
        sheetCount: 4,
        deadline: addDays(-2), // OVERDUE
        status: 'มีการ Revise',
        notes: 'Major structural update requested by client.'
      },

      // Project P2602 FloorZones
      {
        projectId: createdProjects[1].id,
        name: 'Villa Foundation',
        sheetCount: 3,
        deadline: addDays(-10),
        status: 'มีแบบ Shop แล้ว',
        notes: 'Completed layout.'
      },
      {
        projectId: createdProjects[1].id,
        name: 'Villa Ground Floor Structure',
        sheetCount: 5,
        deadline: addDays(-5),
        status: 'ออกของแล้ว',
        notes: 'Framing is fully manufactured.'
      },

      // Project P2603 FloorZones
      {
        projectId: createdProjects[2].id,
        name: 'Floor 1 Layout',
        sheetCount: 8,
        deadline: addDays(8),
        status: 'กำลังทำ Shop',
        notes: 'Main power layout diagrams.'
      },
      {
        projectId: createdProjects[2].id,
        name: 'Floor 2 Layout',
        sheetCount: 1, // Default 1 sheet
        deadline: addDays(2), // RISK
        status: 'รอ Framing',
        notes: 'High complexity electrical lines.'
      }
    ];

    for (const fz of floorZonesData) {
      const cfz = await FloorZone.create(fz);
      // Create initial log
      await TaskHistoryLog.create({
        floorZoneId: cfz.id,
        oldStatus: null,
        newStatus: cfz.status,
        changedByUserId: createdProjects.find(p => p.id === cfz.projectId).engineerId
      });
    }

    console.log('Database successfully seeded with new Project-FloorZone grid data structure!');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  seed();
}
