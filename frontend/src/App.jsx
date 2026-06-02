import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Layers, 
  Users, 
  Clock, 
  Flame, 
  CheckCircle2, 
  Plus, 
  Settings as SettingsIcon, 
  Activity, 
  ArrowRight,
  Info,
  Calendar,
  AlertTriangle,
  History,
  Check,
  Eye,
  FileText,
  UserCheck,
  Wrench,
  Grid,
  X,
  Archive,
  RefreshCw,
  FolderMinus,
  ArrowUpRight,
  Trash2,
  ListTodo,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Lock,
  Mail,
  UserPlus,
  KeyRound,
  LogOut,
  Sliders,
  Spline
} from 'lucide-react';

// Prefer same-origin API so Vite proxy and backend-served frontend both work.
// Override with VITE_API_BASE only when frontend is hosted separately.
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const COMPLETED_STATUSES = new Set(['มีแบบ Shop แล้ว', 'ออกของแล้ว']);
const READY_FOR_SHOP_STATUS = 'พร้อมทำ Shop';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const parseFloorSortValue = (name) => {
  const match = String(name || '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
};

const compareFloorZones = (a, b) => {
  const aNum = parseFloorSortValue(a.name);
  const bNum = parseFloorSortValue(b.name);
  if (aNum !== bNum) return aNum - bNum;
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
};

const expandFloorInput = (rawText) => {
  const items = String(rawText || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  const expanded = [];
  items.forEach(item => {
    const rangeMatch = item.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      const step = start <= end ? 1 : -1;
      for (let n = start; step > 0 ? n <= end : n >= end; n += step) {
        expanded.push(String(n));
      }
      return;
    }

    expanded.push(item);
  });

  return expanded;
};

const STATUS_FLOW = [
  'รอ Framing',
  'มีการ Revise',
  'พร้อมทำ Shop',
  'กำลังทำ Shop',
  'มีแบบ Shop แล้ว',
  'ออกของแล้ว'
];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('syncdraft_token') || null);
  const [currentUser, setCurrentUser] = useState(
    localStorage.getItem('syncdraft_user') ? JSON.parse(localStorage.getItem('syncdraft_user')) : null
  );

  // Core States
  const [activeTab, setActiveTab] = useState('workspace'); // 'workspace', 'dashboard', 'recovery', 'admin'
  const [projects, setProjects] = useState([]);
  const [archivedData, setArchivedData] = useState({ archivedProjects: [], softDeletedFloors: [] });
  const [users, setUsers] = useState([]);
  const [dashboardData, setDashboardData] = useState({ stats: {}, draftWorkloads: [], engineerWorkloads: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Login Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Dynamic Workload settings
  const [workloadConfig, setWorkloadConfig] = useState({
    hoursPerSheet: 1.5,
    maxSheetsThreshold: 5,
    warningDaysThreshold: 2
  });

  // Admin Dashboard States
  const [adminSubTab, setAdminSubTab] = useState('users'); // 'users', 'workload'
  const [adminUsersList, setAdminUsersList] = useState([]);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState(null);
  
  // User Form States (Create/Edit)
  const [userFormName, setUserFormName] = useState('');
  const [userFormEmail, setUserFormEmail] = useState('');
  const [userFormRole, setUserFormRole] = useState('engineer');
  const [userFormPassword, setUserFormPassword] = useState('');

  // Filters
  const [filterOnlyMyWork, setFilterOnlyMyWork] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Accordion open/close state for projects (ช่วยให้เปิด/ปิดแสดงผลแบบย่อ รองรับ 20+ โครงการ)
  const [openProjectAccordions, setOpenProjectAccordions] = useState({});

  // Modals & Panels
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isFloorEditOpen, setIsFloorEditOpen] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [floorHistory, setFloorHistory] = useState([]);

  // Inline Quick Add Floor
  const [quickFloorName, setQuickFloorName] = useState({});
  const [quickFloorDeadline, setQuickFloorDeadline] = useState({});

  // Create Project Form
  const [newProjectNumber, setNewProjectNumber] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newEngineerId, setNewEngineerId] = useState('');
  const [newDraftId, setNewDraftId] = useState('');
  const [newProjectNotes, setNewProjectNotes] = useState('');
  const [newFloorInputText, setNewFloorInputText] = useState('');
  const [defaultDeadline, setDefaultDeadline] = useState('');

  // Floor Edit Form
  const [editFloorName, setEditFloorName] = useState('');
  const [editFloorDeadline, setEditFloorDeadline] = useState('');
  const [editFloorStatus, setEditFloorStatus] = useState('รอ Framing');
  const [editFloorNotes, setEditFloorNotes] = useState('');
  const [editAssignedDraftId, setEditAssignedDraftId] = useState('');
  const [editFloorProjectDraftId, setEditFloorProjectDraftId] = useState('');

  // Workload settings form
  const [cfgHoursPerSheet, setCfgHoursPerSheet] = useState(1.5);
  const [cfgMaxSheets, setCfgMaxSheets] = useState(5);
  const [cfgWarningDays, setCfgWarningDays] = useState(2);

  const getAuthHeaders = (authToken = token) => {
    return {
      'Content-Type': 'application/json',
      'Authorization': authToken ? `Bearer ${authToken}` : ''
    };
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setLoginError('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'การเข้าสู่ระบบล้มเหลว');
      }

      localStorage.setItem('syncdraft_token', data.token);
      localStorage.setItem('syncdraft_user', JSON.stringify(data.user));
      setCurrentUser(data.user);
      setToken(data.token);
      setLoginError('');
      setLoginEmail('');
      setLoginPassword('');
      // Use the fresh token immediately; React state updates are async.
      await fetchData(data.user, data.token);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('syncdraft_token');
    localStorage.removeItem('syncdraft_user');
    setToken(null);
    setCurrentUser(null);
    setActiveTab('workspace');
  };

  const fetchData = async (userOverride, tokenOverride) => {
    const activeUser = userOverride || currentUser;
    const authToken = tokenOverride || token;
    if (!authToken) return;
    setIsLoading(true);
    try {
      // 1. Fetch Users
      const usersRes = await fetch(`${API_BASE}/users`, { headers: getAuthHeaders(authToken) });
      if (!usersRes.ok) {
        if (usersRes.status === 401) {
          handleLogout();
          return;
        }
        throw new Error('Offline or Session expired');
      }
      const usersData = await usersRes.json();
      setUsers(usersData);

      // 2. Fetch Projects
      const projRes = await fetch(`${API_BASE}/projects`, { headers: getAuthHeaders(authToken) });
      const projData = await projRes.json();
      setProjects(projData);

      // Pre-fill accordion state to have first project open by default
      if (projData.length > 0 && Object.keys(openProjectAccordions).length === 0) {
        const initialAccordions = {};
        projData.forEach(p => {
          initialAccordions[p.id] = true;
        });
        setOpenProjectAccordions(initialAccordions);
      }

      // 3. Fetch Restoration Data
      const archivedRes = await fetch(`${API_BASE}/projects/archived`, { headers: getAuthHeaders(authToken) });
      const archData = await archivedRes.json();
      setArchivedData(archData);

      // 4. Fetch Dashboard stats
      const dashRes = await fetch(`${API_BASE}/dashboard`, { headers: getAuthHeaders(authToken) });
      const dashData = await dashRes.json();
      setDashboardData(dashData);

      // 5. Fetch Settings
      const settingsRes = await fetch(`${API_BASE}/settings`, { headers: getAuthHeaders(authToken) });
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setWorkloadConfig(settingsData);
        setCfgHoursPerSheet(settingsData.hoursPerSheet);
        setCfgMaxSheets(settingsData.maxSheetsThreshold);
        setCfgWarningDays(settingsData.warningDaysThreshold);
      }

      // 6. If Admin, fetch full users list for Admin CRUD
      if (activeUser && activeUser.role === 'admin') {
        const adminUsersRes = await fetch(`${API_BASE}/admin/users`, { headers: getAuthHeaders(authToken) });
        if (adminUsersRes.ok) {
          const adminUsersData = await adminUsersRes.json();
          setAdminUsersList(adminUsersData);
        }
      }

      setError(null);
    } catch (err) {
      console.error(err);
      setError('Connection offline or authorization expired.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only auto-fetch on mount if token already existed (page refresh)
    // After login, fetchData is called directly with userOverride instead
    if (token && currentUser) {
      fetchData(currentUser, token);
    }
  }, []);

  useEffect(() => {
    document.title = 'Cpost Hard';
  }, []);

  // Toggle Project Accordion (สำหรับจัดการ 20+ โครงการ)
  const toggleAccordion = (projectId) => {
    setOpenProjectAccordions(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  };

  // Toggle All Accordions
  const toggleAllAccordions = (open) => {
    const next = {};
    projects.forEach(p => {
      next[p.id] = open;
    });
    setOpenProjectAccordions(next);
  };

  // Handle Project Creation
  const handleCreateProject = async (e) => {
    e.preventDefault();
    const resolvedEngineerId = currentUser?.role === 'engineer' ? currentUser.id : parseInt(newEngineerId);
    if (!newProjectNumber || !newProjectName || !resolvedEngineerId || !newDraftId) {
      alert('Please fill out all required fields.');
      return;
    }

    const floorsArray = expandFloorInput(newFloorInputText)
      .map(name => ({
        name,
        sheetCount: 1, // 1 ชั้น = 1 แผ่นเสมอ
        deadline: '',
        notes: '',
        assignedDraftId: parseInt(newDraftId, 10)
      }));

    if (floorsArray.length === 0) {
      alert('กรุณาระบุชั้นงานอย่างน้อย 1 รายการ');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          projectNumber: newProjectNumber,
          projectName: newProjectName,
          engineerId: resolvedEngineerId,
          draftId: parseInt(newDraftId),
          notes: newProjectNotes,
          floorZones: floorsArray
        })
      });

      if (!response.ok) throw new Error('Failed to create project');
      setIsCreateProjectOpen(false);
      setNewProjectNumber('');
      setNewProjectName('');
      setNewProjectNotes('');
      setNewFloorInputText('');
      setDefaultDeadline('');
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Add Floor Inline
  const handleQuickAddFloor = async (projectId) => {
    const name = quickFloorName[projectId] || 'Floor New';
    const project = projects.find(p => p.id === projectId);
    const assignedDraftId = project?.draftId || null;

    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/floor-zones`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name,
          sheetCount: 1, // 1 ชั้น = 1 แผ่นเสมอ
          deadline: '',
          notes: '',
          assignedDraftId
        })
      });

      if (!response.ok) throw new Error('Failed to add Floor');
      setQuickFloorName({ ...quickFloorName, [projectId]: '' });
      setQuickFloorDeadline({ ...quickFloorDeadline, [projectId]: '' });
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Soft Delete Floor Zone (ปุ่มลบชั้นโซนแบบดึงกลับได้)
  const handleSoftDeleteFloorZone = async (floorId, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to remove this floor zone card? You can pull it back from the Restoration Desk.')) return;
    try {
      const response = await fetch(`${API_BASE}/floor-zones/${floorId}/delete`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          isDeleted: true
        })
      });
      if (!response.ok) throw new Error('Delete failed.');
      setIsFloorEditOpen(false);
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Restore Soft Deleted Floor
  const handleRestoreFloor = async (floorId) => {
    try {
      const response = await fetch(`${API_BASE}/floor-zones/${floorId}/delete`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          isDeleted: false
        })
      });
      if (!response.ok) throw new Error('Restore failed.');
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Archive Project (จบโครงการ)
  const handleArchiveProject = async (projectId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to finish and archive this project? It will be removed from your active workspace.')) return;
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/archive`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isArchived: true })
      });
      if (!response.ok) throw new Error('Archive failed.');
      await fetchData();
      setActiveTab('workspace');
    } catch (err) {
      alert(err.message);
    }
  };

  // Restore Project
  const handleRestoreProject = async (projectId) => {
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/archive`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isArchived: false })
      });
      if (!response.ok) throw new Error('Restore failed.');
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Delete Project Completely (ปุ่มลบโครงการแบบ Cascade)
  const handleDeleteProject = async (projectId, e) => {
    e.stopPropagation();
    if (!confirm('⚠️ คำเตือน: คุณแน่ใจหรือไม่ว่าต้องการ "ลบโครงการนี้ออกอย่างถาวร"? การลบนี้จะล้างข้อมูลชั้นโซนและประวัติการบันทึกทั้งหมดทันทีโดยไม่สามารถกู้คืนได้!')) return;
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'ลบโครงการล้มเหลว');
      }
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Update Floor parameters
  const handleUpdateFloorZone = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/floor-zones/${selectedFloor.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: editFloorName,
          sheetCount: 1, // 1 ชั้น = 1 แผ่นเสมอ
          deadline: editFloorDeadline || null,
          status: editFloorStatus,
          notes: currentUser?.role === 'draft' ? selectedFloor.notes : editFloorNotes,
          assignedDraftId: editAssignedDraftId || selectedFloor.assignedDraftId || editFloorProjectDraftId || null
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Update failed.');
      }
      setIsFloorEditOpen(false);
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Quick Draft Complete Action
  const handleDraftComplete = async (floorId, e) => {
    e.stopPropagation();
    try {
      const response = await fetch(`${API_BASE}/floor-zones/${floorId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status: 'มีแบบ Shop แล้ว'
        })
      });
      if (!response.ok) throw new Error('Action failed.');
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Batch Release: เปลี่ยนสถานะทั้งหมดที่เป็น "มีแบบ Shop แล้ว" => "ออกของแล้ว"
  const handleBatchRelease = async (projectId, e) => {
    e.stopPropagation();
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return;

    const floorsToRelease = proj.floorZones ? proj.floorZones.filter(fz => fz.status === 'มีแบบ Shop แล้ว') : [];
    if (floorsToRelease.length === 0) {
      alert('ไม่มีชั้นงานใดที่เป็นสถานะ "มีแบบ Shop แล้ว" เพื่อสั่งออกของในขณะนี้');
      return;
    }

    if (!confirm(`ยืนยันสั่งออกของ (Batch Release) จำนวน ${floorsToRelease.length} ชั้นงานพร้อมกันทีเดียว?`)) return;

    try {
      for (const fz of floorsToRelease) {
        await fetch(`${API_BASE}/floor-zones/${fz.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            status: 'ออกของแล้ว'
          })
        });
      }
      fetchData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการสั่งออกของแบบกลุ่ม: ' + err.message);
    }
  };

  // ADMIN CRUDS: Users & Settings
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!userFormName || !userFormEmail || !userFormPassword || !userFormRole) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: userFormName,
          email: userFormEmail,
          role: userFormRole,
          password: userFormPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างผู้ใช้งานล้มเหลว');

      setIsCreateUserOpen(false);
      setUserFormName('');
      setUserFormEmail('');
      setUserFormRole('engineer');
      setUserFormPassword('');
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditUserSubmit = async (e) => {
    e.preventDefault();
    if (!userFormName || !userFormEmail || !userFormRole) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    try {
      const body = {
        name: userFormName,
        email: userFormEmail,
        role: userFormRole
      };
      if (userFormPassword) {
        body.password = userFormPassword;
      }

      const res = await fetch(`${API_BASE}/admin/users/${selectedUserForEdit.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'แก้ไขผู้ใช้งานล้มเหลว');

      setIsEditUserOpen(false);
      setSelectedUserForEdit(null);
      setUserFormName('');
      setUserFormEmail('');
      setUserFormPassword('');
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('⚠️ คำเตือน: คุณต้องการลบผู้ใช้งานนี้ออกจากระบบใช่หรือไม่? ข้อมูลโปรไฟล์จะถูกลบออกทั้งหมด')) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ลบผู้ใช้งานล้มเหลว');
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          hoursPerSheet: parseFloat(cfgHoursPerSheet),
          maxSheetsThreshold: parseInt(cfgMaxSheets),
          warningDaysThreshold: parseInt(cfgWarningDays)
        })
      });
      if (!res.ok) throw new Error('บันทึกการตั้งค่าล้มเหลว');
      alert('บันทึกการตั้งค่า Workload เรียบร้อยแล้ว!');
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Filter project workspace according to CURRENT authenticated user
  const activeProjectsFiltered = projects.filter(proj => {
    const matchesQuery = proj.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          proj.projectNumber.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesQuery) return false;

    if (filterOnlyMyWork && currentUser && currentUser.role !== 'admin') {
      if (currentUser.role === 'engineer' && proj.engineerId !== currentUser.id) return false;
      if (currentUser.role === 'draft') {
        const hasMyAssignedFloor = proj.floorZones?.some(fz => (fz.assignedDraftId || proj.draftId) === currentUser.id);
        if (proj.draftId !== currentUser.id && !hasMyAssignedFloor) return false;
      }
    }

    return true;
  });

  // Client-side delay risk calculator (mirrors server logic)
  const getDelayRisk = (fz) => {
    if (COMPLETED_STATUSES.has(fz.status) || !fz.deadline) return 'Normal';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(fz.deadline);
    deadline.setHours(0, 0, 0, 0);
    if (today > deadline) return 'OVERDUE';
    const diffDays = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
    if (diffDays <= workloadConfig.warningDaysThreshold) return 'RISK';
    return 'Normal';
  };

  // Open Floor Editor modal and fetch audit history
  const openFloorEditor = async (fz, proj = null) => {
    setSelectedFloor(fz);
    setEditFloorName(fz.name);
    setEditFloorDeadline(fz.deadline || '');
    setEditFloorStatus(fz.status);
    setEditFloorNotes(fz.notes || '');
    setEditFloorProjectDraftId(proj?.draftId ? String(proj.draftId) : '');
    setEditAssignedDraftId(fz.assignedDraftId ? String(fz.assignedDraftId) : String(proj?.draftId || ''));
    setIsFloorEditOpen(true);
    try {
      const res = await fetch(`${API_BASE}/floor-zones/${fz.id}/history`, { headers: getAuthHeaders() });
      if (res.ok) {
        const logs = await res.json();
        setFloorHistory(logs);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
      setFloorHistory([]);
    }
  };

  // GENERATE DRAFT'S SORTED CHECKLIST TODO LIST (เรียงลำดับงานตามความเสี่ยงและ Deadline เพื่อเป็นไกด์ให้ดร๊าฟ)
  const getDraftChecklist = () => {
    if (!currentUser || currentUser.role !== 'draft') return [];

    const urgentList = [];
    const readyList = [];
    projects
      .filter(p => !p.isArchived)
      .forEach(p => {
        if (p.floorZones) {
          p.floorZones.forEach(fz => {
            const ownerDraftId = fz.assignedDraftId || p.draftId;
            if (ownerDraftId !== currentUser.id) return;

            const risk = getDelayRisk(fz);
            const baseTask = {
              ...fz,
              projectNumber: p.projectNumber,
              projectName: p.projectName,
              delayRisk: risk
            };

            if ((fz.deadline && new Date(fz.deadline) - new Date() <= SEVEN_DAYS_MS) || risk === 'OVERDUE') {
              urgentList.push({
                ...baseTask,
                weight: risk === 'OVERDUE' ? 100 : 50
              });
            } else if (fz.status === READY_FOR_SHOP_STATUS) {
              readyList.push({
                ...baseTask,
                weight: 10
              });
            }
          });
        }
      });

    const source = urgentList.length > 0 ? urgentList : readyList;
    return source.sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return new Date(a.deadline || '2999-12-31') - new Date(b.deadline || '2999-12-31');
    });
  };

  const draftChecklistData = getDraftChecklist();

  // Find Draft with the absolute lowest active sheet workload to recommend
  const getRecommendedDraft = () => {
    if (dashboardData.draftWorkloads.length === 0) return null;
    const sorted = [...dashboardData.draftWorkloads].sort((a, b) => a.estimatedHours - b.estimatedHours);
    return sorted[0];
  };

  const recommendedDraft = getRecommendedDraft();

  // Auto stress workload warning matrix for the logged-in draftsperson
  const getMyStressWarning = () => {
    if (!currentUser || currentUser.role !== 'draft' || !dashboardData.draftWorkloads) return null;
    const myWorkload = dashboardData.draftWorkloads.find(d => d.id === currentUser.id);
    if (!myWorkload) return null;

    // Check if the current draftsperson has > maxSheetsThreshold active floors (1 floor = 1 sheet)
    if (myWorkload.activeFloors > workloadConfig.maxSheetsThreshold) {
      return `⚠️ แจ้งเตือนสภาวะงานล้นมือ: ขณะนี้คุณมีปริมาณชั้นงานค้างรวมกัน ${myWorkload.activeFloors} ชั้น (ซึ่งเกินกว่าค่าเฉลี่ยควบคุม ${workloadConfig.maxSheetsThreshold} ชั้น) โปรดวางแผนบริหารจัดการ หรือปรึกษาวิศวกรเพื่อกระจายปริมาณงานอย่างสมดุล`;
    }
    return null;
  };

  const myStressWarningMessage = getMyStressWarning();

  // Color helper class for card layouts
  const getStatusStyle = (st) => {
    switch (st) {
      case 'รอ Framing': return 's-waiting border-slate-700 bg-slate-800/30 text-slate-300';
      case 'มีการ Revise': return 's-revise border-rose-500/35 bg-rose-500/5 text-rose-300';
      case 'พร้อมทำ Shop': return 's-ready border-cyan-500/35 bg-cyan-500/5 text-cyan-300';
      case 'กำลังทำ Shop': return 's-working border-amber-500/35 bg-amber-500/5 text-amber-300';
      case 'มีแบบ Shop แล้ว': return 's-done border-emerald-500/35 bg-emerald-500/5 text-emerald-300';
      case 'ออกของแล้ว': return 's-released border-purple-500/35 bg-purple-500/5 text-purple-300';
      default: return 'border-slate-800 bg-slate-900/40 text-slate-400';
    }
  };

  // If NOT authenticated, render the login view
  if (!token) {
    return (
      <div className="min-height-screen w-full flex items-center justify-center bg-[#0b0f19] px-4 py-20 font-sans" style={{ minHeight: '100vh' }}>
        <div className="w-full max-w-md glass-panel p-8 rounded-2xl border border-slate-800 shadow-2xl animate-scaleUp">
          
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-400 flex items-center justify-center font-bold text-2xl text-white shadow-lg shadow-brand-500/20 mb-4 animate-pulse-dot">
              ⚡
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white to-brand-400 bg-clip-text text-transparent">
              Cpost Hard
            </h1>
            <p className="text-xs text-slate-400 mt-2 font-medium">
              ระบบจัดคิวงาน Shop Drawing และควบคุม Workload วิศวกร-ดร๊าฟ
            </p>
          </div>

          {loginError && (
            <div className="p-3 mb-5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-semibold text-rose-400 text-center animate-fadeIn">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Mail className="h-3 w-3 text-brand-400" /> อีเมลผู้ใช้
              </label>
              <input 
                type="email" 
                required 
                placeholder="email@syncdraft.com" 
                className="glass-input w-full px-4 py-2.5 rounded-lg text-sm text-slate-200"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Lock className="h-3 w-3 text-brand-400" /> รหัสผ่าน
              </label>
              <input 
                type="password" 
                required 
                placeholder="••••••" 
                className="glass-input w-full px-4 py-2.5 rounded-lg text-sm text-slate-200 animate-fadeIn"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>

            <button 
              type="submit" 
              disabled={isLoggingIn}
              className="w-full py-3 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold rounded-lg transition-all shadow-lg shadow-brand-500/20 text-sm mt-6 flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <span>กำลังเข้าระบบ...</span>
              ) : (
                <>
                  <span>เข้าสู่ระบบ</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-900 pt-4 text-center">
            <span className="text-[10px] text-slate-500 leading-relaxed block">
              💡 เข้าระบบครั้งแรกด้วยบัญชีผู้ใช้เริ่มต้น เช่น:
            </span>
            <span className="text-[10px] text-brand-400 mt-1 block font-semibold">
              Admin: admin@syncdraft.com (รหัสผ่าน: admin123)
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block font-semibold">
              Engineer: supharoek@syncdraft.com (รหัสผ่าน: 123456)
            </span>
          </div>

        </div>
      </div>
    );
  }

  // IF AUTHENTICATED BUT LOADING: Show loading screen (handles Render cold start)
  if (token && isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0b0f19] gap-6 font-sans">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-400 flex items-center justify-center font-bold text-3xl text-white shadow-lg shadow-brand-500/30 animate-pulse">
          ⚡
        </div>
        <div className="text-center">
          <p className="text-slate-200 font-bold text-base">กำลังเชื่อมต่อระบบ...</p>
          <p className="text-slate-500 text-xs mt-2">กรุณารอสักครู่ ระบบ Backend กำลังเริ่มทำงาน</p>
          <p className="text-slate-600 text-[10px] mt-1">(Render free tier ใช้เวลาประมาณ 30-60 วินาที)</p>
        </div>
        <div className="flex gap-1.5 mt-2">
          <span className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{animationDelay:'0ms'}}></span>
          <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}}></span>
          <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}}></span>
        </div>
      </div>
    );
  }

  // IF ERROR (backend unreachable): Show retry screen
  if (token && error) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0b0f19] gap-6 font-sans px-4">
        <div className="h-16 w-16 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-3xl">
          ⚠️
        </div>
        <div className="text-center max-w-sm">
          <p className="text-slate-200 font-bold text-base">ไม่สามารถเชื่อมต่อ Backend ได้</p>
          <p className="text-slate-500 text-xs mt-2 leading-relaxed">
            Render อาจยังไม่ตื่น (cold start) หรือ network มีปัญหา<br/>
            กรุณากด Retry อีกครั้ง
          </p>
          <p className="text-rose-400/70 text-[10px] mt-2 font-mono">{error}</p>
        </div>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => { setError(null); setIsLoading(true); fetchData(); }}
            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-brand-500/20 flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Retry เชื่อมต่อใหม่
          </button>
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm transition-all"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }

  // IF AUTHENTICATED: Render main app workspace

  return (
    <div className="font-sans min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col selection:bg-brand-500 selection:text-white pb-20">
      
      {/* Dynamic styles injected for floor cards */}
      <style dangerouslySetInnerHTML={{__html: `
        .s-waiting { border-color: rgba(100,116,139,0.3) !important; background: rgba(30,41,59,0.2) !important; }
        .s-revise { border-color: rgba(244,63,94,0.3) !important; background: rgba(244,63,94,0.06) !important; }
        .s-ready { border-color: rgba(34,211,238,0.3) !important; background: rgba(34,211,238,0.06) !important; }
        .s-working { border-color: rgba(251,191,36,0.3) !important; background: rgba(251,191,36,0.06) !important; }
        .s-done { border-color: rgba(16,185,129,0.3) !important; background: rgba(16,185,129,0.06) !important; }
        .s-released { border-color: rgba(167,139,250,0.3) !important; background: rgba(167,139,250,0.06) !important; }
      `}} />

      {/* HEADER CONTROL BAR */}
      <header className="sticky top-0 z-40 bg-[#0b0f19]/85 backdrop-blur-xl border-b border-slate-900 py-3 px-6 flex flex-wrap items-center justify-between gap-4">
        
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-400 flex items-center justify-center font-bold text-xl text-white shadow-md shadow-brand-500/20">
            ⚡
          </div>
          <div className="text-left">
            <h1 className="text-base font-extrabold tracking-wide leading-none text-slate-200">Cpost Hard</h1>
            <span className="text-[10px] font-bold text-brand-400 mt-1 block">ENGINEER & DRAFT BOARD</span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Currently logged-in profile bar */}
          <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800/80 px-4 py-1.5 rounded-xl">
            <div className="text-right">
              <span className="text-xs font-bold text-slate-200 block">{currentUser.name}</span>
              <span className="text-[9px] font-bold text-brand-400 uppercase tracking-widest block">{currentUser.role}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-1 text-slate-400 hover:text-rose-400 rounded-lg transition-all"
              title="ออกจากระบบ"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* BODY CONTENT CONTAINER */}
      <div className="max-w-[1320px] w-full mx-auto px-6 mt-8 flex-grow">
        
        {/* NAV TABS SELECTOR */}
        <div className="flex justify-between items-center border-b border-slate-900 mb-8 overflow-x-auto">
          <div className="flex gap-8">
            <button 
              onClick={() => setActiveTab('workspace')}
              className={`pb-4 text-xs font-bold transition-all flex items-center gap-1.5 border-b-2 ${
                activeTab === 'workspace' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="h-4 w-4" /> แผงควบคุมงาน (Workspace)
            </button>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`pb-4 text-xs font-bold transition-all flex items-center gap-1.5 border-b-2 ${
                activeTab === 'dashboard' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="h-4 w-4" /> แดชบอร์ดวิเคราะห์ (Dashboard)
            </button>
            <button 
              onClick={() => setActiveTab('recovery')}
              className={`pb-4 text-xs font-bold transition-all flex items-center gap-1.5 border-b-2 ${
                activeTab === 'recovery' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <RefreshCw className="h-4 w-4" /> ถังขยะกู้คืนข้อมูล (Restoration)
            </button>

            {/* Admin back-office tab: Visible strictly to admin */}
            {currentUser && currentUser.role === 'admin' && (
              <button 
                onClick={() => setActiveTab('admin')}
                className={`pb-4 text-xs font-bold transition-all flex items-center gap-1.5 border-b-2 ${
                  activeTab === 'admin' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <SettingsIcon className="h-4 w-4" /> ระบบหลังบ้าน Admin (Settings)
              </button>
            )}
          </div>

          {/* Quick toggle filter by roles */}
          {activeTab === 'workspace' && currentUser && currentUser.role !== 'admin' && (
            <div className="flex items-center gap-2 mb-3 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 font-semibold px-2">กรองงาน:</span>
              <button 
                onClick={() => setFilterOnlyMyWork(true)}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${
                  filterOnlyMyWork ? 'bg-brand-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                งานของฉัน
              </button>
              <button 
                onClick={() => setFilterOnlyMyWork(false)}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${
                  !filterOnlyMyWork ? 'bg-brand-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                งานทั้งหมด
              </button>
            </div>
          )}
        </div>

        {/* TAB 1: ACCORDION WORKSPACE */}
        {activeTab === 'workspace' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Auto workload alert warning */}
            {myStressWarningMessage && (
              <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-2xl flex items-start gap-3 animate-fadeIn text-left">
                <AlertTriangle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-rose-300 font-semibold leading-relaxed">
                  {myStressWarningMessage}
                </p>
              </div>
            )}

            {/* Checklist guide desk (เรียงลำดับคิวงานเดดไลน์ด่วนที่สุด) */}
            {currentUser && currentUser.role === 'draft' && draftChecklistData.length > 0 && (
              <div className="glass-panel p-5 rounded-2xl border border-brand-500/25 bg-brand-500/5 text-left">
                <h3 className="text-sm font-extrabold text-brand-300 flex items-center gap-2 mb-3">
                  <ListTodo className="h-4 w-4" />
                  แผงจัดลำดับคิวงานร่างแบบ (Draftsperson Task Priority Guide)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {draftChecklistData.map(item => (
                    <div key={item.id} className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex justify-between items-center gap-3">
                      <div className="text-left truncate">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-brand-300 font-mono">
                            #{item.projectNumber}
                          </span>
                          <span className="text-xs font-bold text-slate-200 truncate">{item.name}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">โครงการ: {item.projectName}</p>
                        <p className="text-[10px] text-slate-400 mt-1">เดดไลน์: {item.deadline}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-extrabold ${
                          item.delayRisk === 'OVERDUE' ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {item.delayRisk}
                        </span>
                        <button
                          onClick={(e) => handleDraftComplete(item.id, e)}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold flex items-center gap-1 shadow-md"
                        >
                          <Check className="h-3 w-3" /> เสร็จ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Control Bar */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 flex-grow max-w-xl">
                <input 
                  type="text" 
                  placeholder="ค้นหาเลขโครงการ, ชื่อโครงการ..." 
                  className="glass-input px-4 py-2 text-sm rounded-lg w-full text-slate-200"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                
                <select 
                  className="glass-input px-3 py-2 text-xs rounded-lg text-slate-350"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="All">สถานะชั้นงานทั้งหมด</option>
                  {STATUS_FLOW.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>

              {/* Accordion Collapse/Expand Controls */}
              <div className="flex gap-2">
                <button
                  onClick={() => toggleAllAccordions(true)}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-xs font-semibold rounded text-slate-400 hover:text-slate-200"
                >
                  ขยายทั้งหมด
                </button>
                <button
                  onClick={() => toggleAllAccordions(false)}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-xs font-semibold rounded text-slate-400 hover:text-slate-200"
                >
                  ย่อทั้งหมด
                </button>
              </div>

              {currentUser && currentUser.role === 'engineer' && (
                <button 
                  onClick={() => {
                    const currentDrf = users.find(u => u.role === 'draft');
                    if (currentUser?.role === 'engineer') {
                      setNewEngineerId(currentUser.id.toString());
                    }
                    if (currentDrf) setNewDraftId(currentDrf.id.toString());
                    setIsCreateProjectOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold rounded-lg transition-all shadow-md text-sm whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" /> สร้างโครงการใหม่
                </button>
              )}
            </div>

            {/* List of Active projects */}
            <div className="space-y-4">
              {activeProjectsFiltered.length === 0 ? (
                <div className="glass-panel p-12 text-center text-slate-400 font-medium rounded-2xl">
                  ไม่มีโครงการใช้งานที่ตรงตามฟิลเตอร์ของคุณ
                </div>
              ) : (
                activeProjectsFiltered.map(proj => {
                  const isExpanded = openProjectAccordions[proj.id];
                  const filteredFloors = proj.floorZones ? proj.floorZones.filter(fz => {
                    return statusFilter === 'All' || fz.status === statusFilter;
                  }) : [];

                  if (filteredFloors.length === 0 && statusFilter !== 'All') return null;

                  return (
                    <div key={proj.id} className="glass-panel rounded-xl border border-slate-800/80 overflow-hidden">
                      
                      {/* Project Header Info */}
                      <div 
                        onClick={() => toggleAccordion(proj.id)}
                        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-slate-900/40 hover:bg-slate-900/60 transition-all cursor-pointer select-none text-left"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-brand-500/15 text-brand-300 border border-brand-500/25">
                              #{proj.projectNumber}
                            </span>
                            <h2 className="text-sm font-bold text-slate-200">{proj.projectName}</h2>
                            <span className="text-[10px] text-slate-500">({filteredFloors.length} ชั้นย่อย)</span>
                          </div>
                        </div>

                        {/* Project Actions */}
                        <div className="flex items-center gap-3 flex-wrap" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-3 text-[10px] text-slate-400">
                            <span><strong className="text-slate-500">วิศวกร:</strong> {proj.engineer?.name}</span>
                            <span><strong className="text-slate-500">ดร๊าฟ:</strong> {proj.draft?.name}</span>
                          </div>
                          
                          {proj.floorZones && proj.floorZones.some(fz => fz.status === 'มีแบบ Shop แล้ว') && (
                            <button 
                              onClick={(e) => handleBatchRelease(proj.id, e)}
                              className="px-2.5 py-1 bg-purple-600/10 border border-purple-500/25 hover:bg-purple-600/25 text-purple-300 text-[10px] font-bold rounded-md flex items-center gap-1 transition-all"
                              title="ส่งออกของแบบกลุ่ม"
                            >
                              <Spline className="h-3 w-3" /> ออกของกลุ่ม
                            </button>
                          )}

                          {currentUser && currentUser.role === 'engineer' && proj.engineerId === currentUser.id && (
                            <button 
                              onClick={(e) => handleArchiveProject(proj.id, e)}
                              className="px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-brand-500 hover:text-brand-300 text-[10px] font-bold rounded-md flex items-center gap-1 transition-all text-slate-400"
                              title="จบโครงการ"
                            >
                              <Archive className="h-3 w-3" /> จบโครงการ
                            </button>
                          )}

                          {/* Delete project button */}
                          {(currentUser.role === 'admin' || (currentUser.role === 'engineer' && proj.engineerId === currentUser.id)) && (
                            <button 
                              onClick={(e) => handleDeleteProject(proj.id, e)}
                              className="px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-rose-500 hover:text-rose-400 text-[10px] font-bold rounded-md flex items-center gap-1 transition-all text-slate-400"
                              title="ลบโครงการอย่างถาวร"
                            >
                              <Trash2 className="h-3 w-3 text-rose-500" /> ลบโครงการ
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Accordion Content */}
                      {isExpanded && (
                        <div className="p-4 space-y-4 border-t border-slate-800/40 text-left">
                          
                          {/* Micro condensed floor pills grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                            {filteredFloors.map(fz => {
                              const delayRisk = fz.delayRisk;
                              const isOverdue = delayRisk === 'OVERDUE';
                              const assignedOwnerDraftId = fz.assignedDraftId || proj.draftId;
                              const isDraft = currentUser && currentUser.role === 'draft' && assignedOwnerDraftId === currentUser.id;

                              return (
                                <div 
                                  key={fz.id}
                                  onClick={() => openFloorEditor(fz, proj)}
                                  className={`p-2 rounded-lg border cursor-pointer transition-all duration-150 hover:-translate-y-0.5 flex flex-col justify-between h-20 text-left relative ${getStatusStyle(fz.status)}`}
                                >
                                  <div>
                                    <div className="flex justify-between items-start gap-1">
                                      <h3 className="font-bold text-slate-200 text-[11px] truncate w-full" title={fz.name}>
                                        {fz.name}
                                      </h3>
                                      {fz.notes && (
                                        <FileText className="h-3 w-3 text-amber-400 flex-shrink-0" title="มี Note" />
                                      )}
                                    </div>
                                    <div className="flex gap-1.5 text-[8.5px] text-slate-400 font-mono mt-0.5">
                                      <span>{workloadConfig.hoursPerSheet}h</span>
                                      <span>|</span>
                                      <span>{fz.deadline ? fz.deadline.slice(5) : 'No DL'}</span>
                                    </div>
                                    {fz.subZones?.length > 0 && (
                                      <div className="text-[8px] text-purple-300 mt-1 font-bold">
                                        แยกโซนย่อย {fz.subZones.length} รายการ
                                      </div>
                                    )}
                                    <div className="text-[8px] text-slate-500 mt-1 truncate">
                                      {fz.assignedDraft?.name ? `Assign: ${fz.assignedDraft.name}` : `Assign: ${proj.draft?.name}`}
                                    </div>
                                  </div>

                                  {isOverdue && (
                                    <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-rose-500 animate-ping"></div>
                                  )}

                                  <div className="mt-auto flex items-center justify-between pt-1 border-t border-slate-850/60">
                                    <span className="text-[8.5px] font-extrabold truncate w-14">
                                      {fz.status}
                                    </span>
                                    {isDraft && fz.status !== 'มีแบบ Shop แล้ว' && fz.status !== 'ออกของแล้ว' && (
                                      <button 
                                        onClick={(e) => handleDraftComplete(fz.id, e)}
                                        className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[8px] font-bold transition-all shadow-md"
                                      >
                                        <Check className="h-2.5 w-2.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Quick Add Floor */}
                          {currentUser && currentUser.role === 'engineer' && proj.engineerId === currentUser.id && (
                            <div className="pt-3 border-t border-slate-800/40 flex flex-wrap items-center gap-3 bg-slate-900/10 p-2.5 rounded-lg border border-slate-800/40">
                              <span className="text-xs font-semibold text-slate-400">เพิ่มชั้นงานย่อย (Quick Add):</span>
                              <input 
                                type="text" 
                                placeholder="ชื่อชั้น/โซน" 
                                className="glass-input px-2 py-1 text-xs rounded border w-28 text-slate-200"
                                value={quickFloorName[proj.id] || ''}
                                onChange={(e) => setQuickFloorName({ ...quickFloorName, [proj.id]: e.target.value })}
                              />
                              <input 
                                type="date" 
                                className="glass-input px-2 py-1 text-xs rounded border text-slate-200"
                                value={quickFloorDeadline[proj.id] || defaultDeadline}
                                onChange={(e) => setQuickFloorDeadline({ ...quickFloorDeadline, [proj.id]: e.target.value })}
                              />
                              <button 
                                onClick={() => handleQuickAddFloor(proj.id)}
                                className="px-3 py-1 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded flex items-center gap-1 transition-all"
                              >
                                <Plus className="h-3 w-3" /> เพิ่มชั้นงาน
                              </button>
                            </div>
                          )}

                        </div>
                      )}

                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ANALYTICAL DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-fadeIn text-left">
            {/* Overview cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="glass-card p-6 rounded-2xl">
                <span className="text-sm font-semibold text-slate-400 block">Total Active Floor/Zones</span>
                <span className="text-3xl font-extrabold mt-1 text-white block">{dashboardData.stats.totalFloors || 0}</span>
              </div>
              <div className="glass-card p-6 rounded-2xl">
                <span className="text-sm font-semibold text-slate-400 block">Active Layouts (Floors)</span>
                <span className="text-3xl font-extrabold mt-1 text-white block">{dashboardData.stats.activeFloors || 0}</span>
              </div>
              <div className="glass-card p-6 rounded-2xl border-rose-500/30">
                <span className="text-sm font-semibold text-slate-400 block">Overdue Deadlines</span>
                <span className={`text-3xl font-extrabold mt-1 block ${dashboardData.stats.overdueFloors > 0 ? 'text-rose-400 font-extrabold' : 'text-slate-200'}`}>{dashboardData.stats.overdueFloors || 0}</span>
              </div>
              <div className="glass-card p-6 rounded-2xl">
                <span className="text-sm font-semibold text-slate-400 block">Completed Shop Drawings</span>
                <span className="text-3xl font-extrabold mt-1 text-white block">{dashboardData.stats.completedFloors || 0}</span>
              </div>
            </div>

            {/* Load balanced suggestions */}
            {currentUser && currentUser.role === 'engineer' && recommendedDraft && (
              <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-4 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-6 w-6 text-emerald-400" />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">คำแนะนำในการเฉลี่ยโหลดงาน (Load Balancing Recommendation):</span>
                    <p className="text-xs text-slate-400 mt-0.5">
                      คุณ **{recommendedDraft.name}** มีความเครียดของคิวงานค้างน้อยที่สุดในระบบ (**{recommendedDraft.estimatedHours} ชั่วโมง**) แนะนำให้จ่ายคิวโครงการถัดไปให้ดร๊าฟท่านนี้เพื่อความคล่องตัวในการทำงาน
                    </p>
                  </div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <span className="text-[10px] text-slate-500 uppercase block">Queue stress</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">{recommendedDraft.activeFloors} งานค้าง</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* DRAFTSPERSON STRESS VIEW */}
              <div className="glass-panel p-6 rounded-2xl text-left">
                <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                  <Users className="h-5 w-5 text-brand-400" />
                  ตาราง Workload & Delay Tracker ของดร๊าฟทุกคน
                </h3>
                <div className="space-y-4">
                  {dashboardData.draftWorkloads.map(draft => {
                    const isHigh = draft.activeFloors > workloadConfig.maxSheetsThreshold;
                    return (
                      <div key={draft.id} className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-200 flex items-center gap-2">
                            {draft.name}
                            {isHigh && (
                              <span className="text-[9px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-extrabold border border-rose-500/20 animate-pulse">
                                OVERLOAD
                              </span>
                            )}
                          </span>
                          {draft.overdueFloors > 0 && <span className="text-rose-400 text-xs font-bold">{draft.overdueFloors} Overdue</span>}
                        </div>
                        <div>
                          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round(Math.min(100, (draft.estimatedHours / 40) * 100))}%` }}></div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-center text-xs bg-slate-950 p-2 rounded">
                          <div>
                            <span className="text-[10px] text-slate-500">จำนวนชั้น/โซน (แผ่น)</span>
                            <span className="block font-bold text-brand-300">{draft.activeFloors} ชั้น</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500">ภาระงานสะสมคิว</span>
                            <span className="block font-extrabold text-cyan-300">{draft.estimatedHours} ชั่วโมง</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ENGINEER PLANNER VIEW */}
              <div className="glass-panel p-6 rounded-2xl text-left">
                <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                  <UserCheck className="h-5 w-5 text-brand-400" />
                  ฝ่ายประสานวิศวกรผู้ดูแลโครงการ (Engineer Planner Desk)
                </h3>
                <div className="space-y-4">
                  {dashboardData.engineerWorkloads.map(eng => (
                    <div key={eng.id} className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 space-y-3">
                      <span className="font-bold text-slate-200 block">{eng.name}</span>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-950 p-2 rounded">
                        <div>
                          <span className="text-[10px] text-slate-500">โครงการที่ดูแล</span>
                          <span className="block font-bold text-slate-300">{eng.projectsCount} โครงการ</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500">จำนวนชั้นสะสม (แผ่น)</span>
                          <span className="block font-bold text-brand-300">{eng.activeFloors} ชั้น</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500">เสร็จสิ้นแล้ว</span>
                          <span className="block font-bold text-emerald-400">{eng.completedFloors} ชั้น</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: RESTORATION */}
        {activeTab === 'recovery' && (
          <div className="space-y-8 animate-fadeIn max-w-4xl text-left">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-2">
                  <RefreshCw className="h-5 w-5 text-brand-400" />
                  ตู้กู้คืนข้อมูล (Restoration Accident Recovery Desk)
                </h2>
                <p className="text-xs text-slate-400 border-b border-slate-800 pb-4">
                  กู้คืนข้อมูลชั้นงานย่อยที่เผลอกดลบผิด หรือโครงการที่ปิดเป้าหมายสำเร็จไปแล้วให้ดึงกลับมาเป็นปกติ
                </p>
              </div>

              {/* Archived projects */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide">โครงการที่ปิดไปแล้ว (Archived Projects)</h3>
                {archivedData.archivedProjects?.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-4 bg-slate-900/20 rounded border border-slate-900">ไม่มีประวัติโครงการที่ปิดไป</p>
                ) : (
                  archivedData.archivedProjects?.map(proj => (
                    <div key={proj.id} className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 flex justify-between items-center">
                      <div>
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-brand-500/10 text-brand-300">#{proj.projectNumber}</span>
                        <span className="font-semibold text-slate-200 ml-2">{proj.projectName}</span>
                      </div>
                      <button onClick={() => handleRestoreProject(proj.id)} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 rounded text-xs font-bold flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" /> ดึงกลับโครงการ
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Soft Deleted floor zones */}
              <div className="space-y-4 pt-4">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide">ชั้นงานย่อยที่ถูกลบ (Soft Deleted Floor/Zones)</h3>
                {archivedData.softDeletedFloors?.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-4 bg-slate-900/20 rounded border border-slate-900">ไม่มีประวัติชั้นงานย่อยที่ถูกลบ</p>
                ) : (
                  archivedData.softDeletedFloors?.map(fz => (
                    <div key={fz.id} className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-slate-200 block">{fz.name}</span>
                        <p className="text-[10px] text-slate-500 mt-1">โครงการ: {fz.project?.projectName}</p>
                      </div>
                      <button onClick={() => handleRestoreFloor(fz.id)} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 rounded text-xs font-bold flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" /> กู้คืนชั้นงาน
                      </button>
                    </div>
                  ))
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 4: ADMIN PORTAL */}
        {activeTab === 'admin' && currentUser && currentUser.role === 'admin' && (
          <div className="space-y-8 animate-fadeIn text-left">
            <div className="glass-panel p-6 rounded-2xl border border-slate-850">
              
              <div className="flex justify-between items-center border-b border-slate-850 pb-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                    <SettingsIcon className="h-5 w-5 text-brand-400" />
                    แผงควบคุมหลักฝ่าย Admin (Back-Office Admin Desk)
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    ระบบดูแลรายชื่อผู้ใช้งานทั้งหมดในบริษัท และกำหนดสูตรการคิด Workload แบบ Real-time (1 ชั้น = 1 แผ่นงานเสมอ)
                  </p>
                </div>

                <div className="flex gap-2 bg-slate-950 p-1 rounded-xl border border-slate-850">
                  <button 
                    onClick={() => setAdminSubTab('users')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      adminSubTab === 'users' ? 'bg-brand-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    จัดการผู้ใช้งาน
                  </button>
                  <button 
                    onClick={() => setAdminSubTab('workload')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      adminSubTab === 'workload' ? 'bg-brand-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ตั้งค่าเกณฑ์เกลี่ยงาน
                  </button>
                </div>
              </div>

              {/* Sub-tab 1: User Management */}
              {adminSubTab === 'users' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-extrabold text-slate-300">รายชื่อผู้ใช้งานภายในองค์กร ({adminUsersList.length} คน)</h3>
                    <button 
                      onClick={() => {
                        setUserFormName('');
                        setUserFormEmail('');
                        setUserFormRole('engineer');
                        setUserFormPassword('');
                        setIsCreateUserOpen(true);
                      }}
                      className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-lg text-xs flex items-center gap-1 transition-all"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> เพิ่มผู้ใช้งานใหม่
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-850">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900/60 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-850">
                          <th className="p-4">ลำดับ</th>
                          <th className="p-4">ชื่อ-นามสกุล</th>
                          <th className="p-4">อีเมลผู้ใช้งาน</th>
                          <th className="p-4">บทบาท (Role)</th>
                          <th className="p-4 text-center">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900 text-slate-200 text-xs">
                        {adminUsersList.map((usr, idx) => (
                          <tr key={usr.id} className="hover:bg-slate-900/20 transition-all">
                            <td className="p-4 font-bold text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-4 font-bold text-slate-100">{usr.name}</td>
                            <td className="p-4 text-slate-350 font-mono">{usr.email}</td>
                            <td className="p-4">
                              <span className={`text-[9px] px-2 py-0.5 rounded font-extrabold uppercase ${
                                usr.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                usr.role === 'engineer' ? 'bg-brand-500/10 text-brand-300 border border-brand-500/20' :
                                'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                              }`}>
                                {usr.role}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => {
                                    setSelectedUserForEdit(usr);
                                    setUserFormName(usr.name);
                                    setUserFormEmail(usr.email);
                                    setUserFormRole(usr.role);
                                    setUserFormPassword('');
                                    setIsEditUserOpen(true);
                                  }}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded"
                                >
                                  แก้ไข/รหัสผ่าน
                                </button>
                                <button 
                                  onClick={() => handleDeleteUser(usr.id)}
                                  className="p-1 text-slate-500 hover:text-rose-400 transition-all"
                                  title="ลบผู้ใช้งาน"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sub-tab 2: Workload Settings */}
              {adminSubTab === 'workload' && (
                <form onSubmit={handleSaveSettings} className="space-y-6 max-w-xl">
                  <h3 className="text-sm font-extrabold text-slate-300 border-b border-slate-900 pb-2 flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-brand-400" />
                    กำหนดเกณฑ์คอขวดและเวลาเฉลี่ย (1 ชั้น = 1 แผ่นเสมอ)
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        1. ตัวคูณจำนวนชั่วโมงในการร่างแบบ / 1 ชั้นงาน (ชั่วโมงต่อชั้น)
                      </label>
                      <input 
                        type="number" 
                        step="0.1" 
                        min="0.1" 
                        required 
                        className="glass-input w-full px-4 py-2.5 rounded-lg text-sm text-slate-200 font-bold"
                        value={cfgHoursPerSheet}
                        onChange={(e) => setCfgHoursPerSheet(e.target.value)}
                      />
                      <span className="text-[10px] text-slate-500 block mt-1">
                        * ปัจจุบันกำหนดสูตร: 1 ชั้น = {cfgHoursPerSheet} ชั่วโมงร่างแบบ (ใช้คำนวณ Work Hours บนแดชบอร์ด)
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        2. เกณฑ์จำนวนชั้นงานรวมสูงสุดต่อคน (เพดานคุมความตึงเครียดคิวงาน)
                      </label>
                      <input 
                        type="number" 
                        min="1" 
                        required 
                        className="glass-input w-full px-4 py-2.5 rounded-lg text-sm text-slate-200 font-bold"
                        value={cfgMaxSheets}
                        onChange={(e) => setCfgMaxSheets(e.target.value)}
                      />
                      <span className="text-[10px] text-slate-500 block mt-1">
                        * ระบบจะแสดงสถานะ OVERLOAD เตือนดร๊าฟและฝ่ายวิศวกรหากดร๊าฟมีคิวชั้นงานค้างเกิน {cfgMaxSheets} ชั้น
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        3. เกณฑ์ระยะวันอันตรายส่งงานไม่ทัน (วันเดดไลน์ฉุกเฉิน)
                      </label>
                      <input 
                        type="number" 
                        min="1" 
                        required 
                        className="glass-input w-full px-4 py-2.5 rounded-lg text-sm text-slate-200 font-bold"
                        value={cfgWarningDays}
                        onChange={(e) => setCfgWarningDays(e.target.value)}
                      />
                      <span className="text-[10px] text-slate-500 block mt-1">
                        * สถานะการ์ดจะแจ้งเป็นไฟสีส้มเตือนความเสี่ยง (RISK) ทันทีหากงานมีเดดไลน์คงเหลือน้อยกว่า {cfgWarningDays} วัน
                      </span>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-lg text-xs shadow-md shadow-brand-500/10"
                  >
                    บันทึกเกณฑ์การคำนวณใหม่
                  </button>
                </form>
              )}

            </div>
          </div>
        )}

      </div>

      {/* CREATE PROJECT MODAL */}
      {isCreateProjectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-800 animate-scaleUp">
            <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-200">สร้างแบบแปลนและโครงสร้างแผนงาน (Grid Plan)</h3>
              <button onClick={() => setIsCreateProjectOpen(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-left">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">เลขที่โครงการ *</label>
                    <input type="text" required placeholder="เช่น P2601" className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-200 font-mono"
                      value={newProjectNumber} onChange={(e) => setNewProjectNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">ชื่อโครงการ *</label>
                    <input type="text" required placeholder="เช่น โครงการคอนโดมิเนียมแกรนด์แวลลีย์" className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-200"
                      value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">วิศวกรผู้ควบคุม</label>
                    {currentUser?.role === 'engineer' ? (
                      <input
                        type="text"
                        readOnly
                        className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-300 font-semibold opacity-80"
                        value={currentUser.name}
                      />
                    ) : (
                      <select className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-350 font-semibold"
                        value={newEngineerId} onChange={(e) => setNewEngineerId(e.target.value)}>
                        <option value="">เลือกวิศวกร</option>
                        {users.filter(u => u.role === 'engineer').map(eng => <option key={eng.id} value={eng.id}>{eng.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">ผู้จัดทำแบบ (Draftsperson)</label>
                    <select className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-350 font-semibold"
                      value={newDraftId} onChange={(e) => setNewDraftId(e.target.value)}>
                      <option value="">เลือกดร๊าฟแบบ</option>
                      {users.filter(u => u.role === 'draft').map(dr => <option key={dr.id} value={dr.id}>{dr.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl space-y-3">
                  <label className="block text-xs font-bold text-brand-300 uppercase">รายชื่อชั้น/โซนที่ต้องสร้าง (แยกด้วย , หรือช่วง 1-5) * 1 ชั้น = 1 แผ่นเสมอ</label>
                  <input type="text" className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-200 font-bold"
                    placeholder="1-3, 11, 14-16 หรือ Floor 1, Floor 2"
                    value={newFloorInputText} onChange={(e) => setNewFloorInputText(e.target.value)} />
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase">กำหนดเดดไลน์ของทุกชั้น (ปล่อยว่างได้)</label>
                    <input type="date" className="glass-input w-full px-3 py-1.5 rounded text-sm text-slate-300"
                      value={defaultDeadline} onChange={(e) => setDefaultDeadline(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex justify-end gap-3">
                <button type="button" onClick={() => setIsCreateProjectOpen(false)} className="px-4 py-2 text-slate-400 text-sm">ยกเลิก</button>
                <button type="submit" className="px-5 py-2 bg-brand-600 rounded text-white font-bold text-sm">สร้างคิวโครงการ & Grid</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FLOOR EDIT MODAL */}
      {isFloorEditOpen && selectedFloor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col md:flex-row animate-scaleUp">
            
            <div className="flex-grow p-6 space-y-4 border-r border-slate-800 text-left">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
                <h3 className="font-bold text-slate-200 text-base flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-brand-400" />
                  แผงจัดการแก้ไขชั้นงานย่อย (Floor Editor)
                </h3>

                {currentUser && currentUser.role === 'engineer' && (
                  <button 
                    type="button"
                    onClick={(e) => handleSoftDeleteFloorZone(selectedFloor.id, e)}
                    className="p-2 hover:bg-slate-900 border border-transparent hover:border-rose-500 rounded-lg text-slate-400 hover:text-rose-500 transition-all flex items-center gap-1"
                    title="ลบชั้นย่อยนี้"
                  >
                    <Trash2 className="h-4 w-4 animate-fadeIn" /> <span className="text-xs font-bold">ลบชั้นงาน (Soft Delete)</span>
                  </button>
                )}
              </div>

              <form onSubmit={handleUpdateFloorZone} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">ชื่อชั้น / โซนร่างแบบ</label>
                    <input type="text" className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-200 font-bold"
                      value={editFloorName} onChange={(e) => setEditFloorName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">กำหนดเดดไลน์ส่งแบบ</label>
                    <input type="date" className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-350"
                      value={editFloorDeadline} onChange={(e) => setEditFloorDeadline(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">มอบหมายดร๊าฟผู้รับผิดชอบ</label>
                    {currentUser && currentUser.role === 'draft' ? (
                      <input
                        type="text"
                        readOnly
                        className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-300 opacity-80"
                        value={users.find(u => u.id === parseInt(editAssignedDraftId || editFloorProjectDraftId, 10))?.name || 'ไม่ระบุ'}
                      />
                    ) : (
                      <select
                        className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-300 font-semibold"
                        value={editAssignedDraftId}
                        onChange={(e) => setEditAssignedDraftId(e.target.value)}
                      >
                        <option value="">ใช้ดร๊าฟเดิมของโครงการ</option>
                        {users.filter(u => u.role === 'draft').map(dr => (
                          <option key={dr.id} value={dr.id}>{dr.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">ปรับเปลี่ยนตามช่วงสถานะงานคิว (Status Flow)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {STATUS_FLOW.map(st => {
                      const isActive = editFloorStatus === st;
                      return (
                        <button key={st} type="button" onClick={() => setEditFloorStatus(st)}
                          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${isActive ? 'bg-brand-600 border-brand-500 text-white shadow' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'}`}>
                          {st}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">หมายเหตุเพิ่มเติม</label>
                  <textarea
                    rows="2"
                    className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-200"
                    value={editFloorNotes}
                    onChange={(e) => setEditFloorNotes(e.target.value)}
                    readOnly={currentUser && currentUser.role === 'draft'}
                  ></textarea>
                  {currentUser && currentUser.role === 'draft' && (
                    <p className="text-[10px] text-amber-400 mt-1">สถานะ Draft ดู Note ได้อย่างเดียว ไม่สามารถแก้ไขได้</p>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button type="button" onClick={() => setIsFloorEditOpen(false)} className="px-4 py-2 text-slate-400 text-sm">ยกเลิก</button>
                  <button type="submit" className="px-5 py-2 bg-brand-600 rounded text-white font-bold text-sm">บันทึกการเปลี่ยนแปลง</button>
                </div>
              </form>
            </div>

            {/* Audit History Log */}
            <div className="w-full md:w-80 p-6 bg-slate-950 flex flex-col max-h-[85vh] overflow-y-auto text-left">
              <h3 className="font-bold text-slate-200 text-sm mb-4 border-b border-slate-800 pb-3">ประวัติความคืบหน้า (Audit Trail)</h3>
              <div className="space-y-4">
                {floorHistory.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-8 text-center">ไม่มีบันทึกประวัติก่อนหน้านี้</p>
                ) : (
                  floorHistory.map(log => (
                    <div key={log.id} className="relative pl-5 border-l border-slate-850 pb-2">
                      <div className="absolute top-1 -left-1.5 h-3 w-3 rounded-full bg-brand-500 border-2 border-slate-950"></div>
                      <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-[11px]">
                        <span className="font-bold text-slate-300 block">{log.changedByUser?.name || 'ระบบอัตโนมัติ'}</span>
                        <div className="flex items-center gap-1.5 font-bold text-brand-300 mt-1">
                          {log.oldStatus && <span className="text-slate-400 font-normal">{log.oldStatus} ➡️ </span>}
                          <span>{log.newStatus}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* CREATE USER MODAL (ADMIN ONLY) */}
      {isCreateUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 border border-slate-800 animate-scaleUp text-left">
            <div className="flex justify-between items-center border-b border-slate-850 pb-2.5 mb-4">
              <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                <UserPlus className="h-4.5 w-4.5 text-brand-400" /> สร้างรายชื่อผู้ใช้งานใหม่
              </h3>
              <button onClick={() => setIsCreateUserOpen(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">ชื่อ-นามสกุลผู้ใช้</label>
                <input 
                  type="text" required placeholder="เช่น ศุภฤกษ์ ตรงจิตสุนทร" 
                  className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200"
                  value={userFormName} onChange={(e) => setUserFormName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">อีเมลทางการ</label>
                <input 
                  type="email" required placeholder="name@syncdraft.com" 
                  className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200 font-mono"
                  value={userFormEmail} onChange={(e) => setUserFormEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">รหัสผ่านเริ่มต้น</label>
                <input 
                  type="password" required placeholder="••••••" 
                  className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200"
                  value={userFormPassword} onChange={(e) => setUserFormPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">บทบาทหน้าที่ (Role)</label>
                <select 
                  className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-300 font-semibold"
                  value={userFormRole} onChange={(e) => setUserFormRole(e.target.value)}
                >
                  <option value="engineer">วิศวกร (Engineer)</option>
                  <option value="draft">ดร๊าฟแบบ (Draftsperson)</option>
                  <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsCreateUserOpen(false)} className="px-4 py-2 text-slate-400 text-xs">ยกเลิก</button>
                <button type="submit" className="px-4 py-2 bg-brand-600 rounded text-white font-bold text-xs">ยืนยันสร้างบัญชี</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER / PASSWORD MODAL (ADMIN ONLY) */}
      {isEditUserOpen && selectedUserForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 border border-slate-800 animate-scaleUp text-left">
            <div className="flex justify-between items-center border-b border-slate-850 pb-2.5 mb-4">
              <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                <KeyRound className="h-4.5 w-4.5 text-brand-400" /> แก้ไขโปรไฟล์ / สั่งรีเซ็ตรหัสผ่าน
              </h3>
              <button onClick={() => { setIsEditUserOpen(false); setSelectedUserForEdit(null); }} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleEditUserSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">ชื่อ-นามสกุล</label>
                <input 
                  type="text" required
                  className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200"
                  value={userFormName} onChange={(e) => setUserFormName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">อีเมลผู้ใช้งาน</label>
                <input 
                  type="email" required
                  className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200 font-mono"
                  value={userFormEmail} onChange={(e) => setUserFormEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">เปลี่ยนรหัสผ่าน (กรอกเฉพาะเมื่อต้องการตั้งใหม่)</label>
                <input 
                  type="password" placeholder="ว่างไว้หากใช้รหัสเดิม" 
                  className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200 animate-fadeIn"
                  value={userFormPassword} onChange={(e) => setUserFormPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">บทบาทหน้าที่ (Role)</label>
                <select 
                  className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-300 font-semibold"
                  value={userFormRole} onChange={(e) => setUserFormRole(e.target.value)}
                >
                  <option value="engineer">วิศวกร (Engineer)</option>
                  <option value="draft">ดร๊าฟแบบ (Draftsperson)</option>
                  <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setIsEditUserOpen(false); setSelectedUserForEdit(null); }} className="px-4 py-2 text-slate-400 text-xs">ยกเลิก</button>
                <button type="submit" className="px-4 py-2 bg-brand-600 rounded text-white font-bold text-xs">บันทึกข้อมูล</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
