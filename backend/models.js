const { Sequelize, DataTypes } = require('sequelize');
const fs = require('fs');
const path = require('path');

const dbUrl = process.env.DATABASE_URL;

let sequelize;
if (dbUrl) {
  sequelize = new Sequelize(dbUrl, {
    dialect: 'postgres',
    dialectOptions: dbUrl.includes('sslmode=require') || !dbUrl.includes('localhost') ? {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    } : {},
    logging: false
  });
} else {
  const legacyDbPath = path.join(__dirname, 'syncdraft.sqlite');
  const defaultDbPath = path.join(__dirname, 'data', 'syncdraft.sqlite');
  const dbPath = process.env.DATABASE_PATH || (fs.existsSync(legacyDbPath) ? legacyDbPath : defaultDbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false
  });
}

// 1. Users Model
const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  role: { type: DataTypes.ENUM('engineer', 'draft', 'admin'), allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false, field: 'password_hash' },
  salt: { type: DataTypes.STRING, allowNull: false }
}, {
  tableName: 'users',
  timestamps: false
});

// 2. Engineer Profile
const EngineerProfile = sequelize.define('EngineerProfile', {
  userId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    field: 'user_id',
    references: { model: User, key: 'id' }
  },
  avgDelay: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'avg_delay' }
}, {
  tableName: 'engineers_profile',
  timestamps: false
});

// 3. Draft Profile
const DraftProfile = sequelize.define('DraftProfile', {
  userId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    field: 'user_id',
    references: { model: User, key: 'id' }
  },
  avgDelay: { type: DataTypes.FLOAT, defaultValue: 0.0, field: 'avg_delay' }
}, {
  tableName: 'drafts_profile',
  timestamps: false
});

// 4. Project Model (with isArchived support)
const Project = sequelize.define('Project', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  projectNumber: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'project_number' },
  projectName: { type: DataTypes.STRING, allowNull: false, field: 'project_name' },
  engineerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'engineer_id',
    references: { model: User, key: 'id' }
  },
  draftId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'draft_id',
    references: { model: User, key: 'id' }
  },
  isArchived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_archived'
  },
  notes: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'projects',
  timestamps: false
});

// 5. FloorZone Model (with isDeleted soft-delete support for Trash bin)
const FloorZone = sequelize.define('FloorZone', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  projectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'project_id',
    references: { model: Project, key: 'id' }
  },
  name: { type: DataTypes.STRING, allowNull: false },
  sheetCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'sheet_count' },
  deadline: { type: DataTypes.DATEONLY, allowNull: true },
  parentZoneId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'parent_zone_id'
  },
  assignedDraftId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'assigned_draft_id',
    references: { model: User, key: 'id' }
  },
  status: {
    type: DataTypes.ENUM('รอ Framing', 'มีการ Revise', 'พร้อมทำ Shop', 'กำลังทำ Shop', 'มีแบบ Shop แล้ว', 'ออกของแล้ว'),
    allowNull: false,
    defaultValue: 'รอ Framing'
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_deleted'
  },
  notes: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'floor_zones',
  timestamps: false
});

// 6. Task History Logs Model
const TaskHistoryLog = sequelize.define('TaskHistoryLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  floorZoneId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'floor_zone_id',
    references: { model: FloorZone, key: 'id' }
  },
  oldStatus: { type: DataTypes.STRING, allowNull: true, field: 'old_status' },
  newStatus: { type: DataTypes.STRING, allowNull: false, field: 'new_status' },
  changedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'changed_by_user_id',
    references: { model: User, key: 'id' }
  },
  timestamp: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }
}, {
  tableName: 'task_history_logs',
  timestamps: false
});

// Associations
User.hasOne(EngineerProfile, { foreignKey: 'userId', as: 'engineerProfile' });
EngineerProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasOne(DraftProfile, { foreignKey: 'userId', as: 'draftProfile' });
DraftProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Project.belongsTo(User, { foreignKey: 'engineerId', as: 'engineer' });
Project.belongsTo(User, { foreignKey: 'draftId', as: 'draft' });
Project.hasMany(FloorZone, { foreignKey: 'projectId', as: 'floorZones', onDelete: 'CASCADE' });

FloorZone.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
FloorZone.belongsTo(User, { foreignKey: 'assignedDraftId', as: 'assignedDraft' });
FloorZone.belongsTo(FloorZone, { foreignKey: 'parentZoneId', as: 'parentZone' });
FloorZone.hasMany(FloorZone, { foreignKey: 'parentZoneId', as: 'subZones' });
FloorZone.hasMany(TaskHistoryLog, { foreignKey: 'floorZoneId', as: 'history', onDelete: 'CASCADE' });

TaskHistoryLog.belongsTo(FloorZone, { foreignKey: 'floorZoneId', as: 'floorZone' });
TaskHistoryLog.belongsTo(User, { foreignKey: 'changedByUserId', as: 'changedByUser' });

// 7. Dynamic Settings Model (สำหรับความยืดหยุ่นในการคิด Workload)
const Setting = sequelize.define('Setting', {
  key: { type: DataTypes.STRING, primaryKey: true },
  value: { type: DataTypes.STRING, allowNull: false }
}, {
  tableName: 'settings',
  timestamps: false
});

module.exports = {
  sequelize,
  User,
  EngineerProfile,
  DraftProfile,
  Project,
  FloorZone,
  TaskHistoryLog,
  Setting
};
