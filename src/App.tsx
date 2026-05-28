import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Search, 
  Plus, 
  X, 
  CreditCard, 
  Smartphone, 
  CheckCircle2, 
  Percent, 
  LogOut, 
  ChevronRight,
  Coins,
  Inbox,
  ArrowLeft,
  DollarSign,
  Phone,
  Trash2,
  Users,
  Shield,
  KeyRound,
  UserPlus,
  Lock,
  UserCheck
} from 'lucide-react';
import { ClientInstallment, Payment, UserAccount } from './types';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

// Mock Initial Kyrgyz clients data (amounts in SOM - KGS)
const INITIAL_CLIENTS: ClientInstallment[] = [
  {
    id: 'cl-1',
    tenantId: 'usr-manager1',
    firstName: 'Адилет',
    lastName: 'Маматов',
    inn: '21508200501234', // 14-digit Kyrgyz PIN which acts as INN and is on ID passport
    phoneModel: 'iPhone 15 Pro Max 256GB',
    phone: '+996 555 123 456, +996 700 112 233',
    imei: '354921098432101',
    phonePrice: 98000,
    markupPercent: 15,
    totalRemaining: 112700,
    payments: [
      { id: 'p-1', date: '15.06.2026', amount: 18783, status: 'pending' },
      { id: 'p-2', date: '15.07.2026', amount: 18783, status: 'pending' },
      { id: 'p-3', date: '15.08.2026', amount: 18783, status: 'pending' },
      { id: 'p-4', date: '15.09.2026', amount: 18783, status: 'pending' },
      { id: 'p-5', date: '15.10.2026', amount: 18783, status: 'pending' },
      { id: 'p-6', date: '18.11.2026', amount: 18785, status: 'pending' },
    ]
  },
  {
    id: 'cl-2',
    tenantId: 'usr-manager1',
    firstName: 'Айсулуу',
    lastName: 'Кадырова',
    inn: '10212199500432',
    phoneModel: 'Samsung Galaxy S24 Ultra',
    phone: '+996 707 987 654',
    imei: '358912345678912',
    phonePrice: 85000,
    markupPercent: 12,
    totalRemaining: 63400, // Partial payment already made
    payments: [
      { id: 'p-7', date: '10.06.2026', amount: 15866, status: 'pending' },
      { id: 'p-8', date: '10.07.2026', amount: 15866, status: 'pending' },
      { id: 'p-9', date: '10.08.2026', amount: 15866, status: 'pending' },
      { id: 'p-10', date: '10.09.2026', amount: 15866, status: 'pending' },
      { id: 'p-11', date: '10.10.2026', amount: 15866, status: 'pending' },
      { id: 'p-12', date: '10.11.2026', amount: 15866, status: 'pending' },
    ]
  },
  {
    id: 'cl-3',
    tenantId: 'usr-manager1',
    firstName: 'Нурбек',
    lastName: 'Токтосунов',
    inn: '20905198801928',
    phoneModel: 'Redmi Note 13 Pro+',
    phone: '+996 772 112 233',
    imei: '862341059382173',
    phonePrice: 32000,
    markupPercent: 10,
    totalRemaining: 35200,
    payments: [
      { id: 'p-13', date: '20.06.2026', amount: 5866, status: 'pending' },
      { id: 'p-14', date: '20.07.2026', amount: 5866, status: 'pending' },
      { id: 'p-15', date: '20.08.2026', amount: 5866, status: 'pending' },
      { id: 'p-16', date: '20.09.2026', amount: 5866, status: 'pending' },
      { id: 'p-17', date: '20.10.2026', amount: 5866, status: 'pending' },
      { id: 'p-18', date: '20.11.2026', amount: 5870, status: 'pending' },
    ]
  }
];

// Initial Kyrgyz accounts for managers & admins
const INITIAL_ACCOUNTS: UserAccount[] = [
  {
    id: 'usr-admin',
    login: 'admin',
    passwordHash: 'admin123',
    role: 'admin',
    createdAt: '27.05.2026'
  },
  {
    id: 'usr-manager1',
    login: 'mamatov',
    passwordHash: 'mamatov123',
    role: 'manager',
    createdAt: '27.05.2026'
  }
];

const toInputDate = (dotDate: string): string => {
  if (!dotDate) return '';
  const parts = dotDate.split('.');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
};

const fromInputDate = (dashDate: string): string => {
  if (!dashDate) return '';
  const parts = dashDate.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
  }
  return '';
};

const getClientCreatedAt = (client: ClientInstallment): Date => {
  if (client.createdAt) {
    return new Date(client.createdAt);
  }
  // Safe Fallback if client has no createdAt timestamp in DB yet
  const idParts = client.id.split('-');
  if (idParts[0] === 'cl' && idParts[1] && !isNaN(Number(idParts[1])) && idParts[1].length > 6) {
    return new Date(Number(idParts[1]));
  }
  // For cl-1, cl-2, cl-3 from INITIAL_CLIENTS which represent historic samples from May 2026
  if (client.id === 'cl-1') return new Date('2026-05-15T12:00:00Z');
  if (client.id === 'cl-2') return new Date('2026-05-10T12:00:00Z');
  if (client.id === 'cl-3') return new Date('2026-05-20T12:00:00Z');
  
  return new Date(); // fallback safe
};

export default function App() {
  // User accounts database from localStorage with Firestore integration
  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem('installments-users-v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return INITIAL_ACCOUNTS;
      }
    }
    return INITIAL_ACCOUNTS;
  });

  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('isLoggedIn') === 'true';
  });
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('installments-current-user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Active workspace tab ('reestr' | 'users' (Admin-control panel))
  const [activeTab, setActiveTab] = useState<'reestr' | 'users'>('reestr');

  // New User Account Admin fields state
  const [newAdminLogin, setNewAdminLogin] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'admin' | 'manager'>('manager');
  const [adminPanelSuccess, setAdminPanelSuccess] = useState<string | null>(null);
  const [adminPanelError, setAdminPanelError] = useState<string | null>(null);

  // Installments state
  const [clients, setClients] = useState<ClientInstallment[]>(() => {
    const saved = localStorage.getItem('clients-database-v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return INITIAL_CLIENTS;
      }
    }
    return INITIAL_CLIENTS;
  });

  const [dbLoading, setDbLoading] = useState(true);

  // Sync users and clients with Firestore
  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList: UserAccount[] = [];
      snapshot.forEach((doc) => {
        usersList.push(doc.data() as UserAccount);
      });
      if (usersList.length === 0) {
        // Bootstrap
        INITIAL_ACCOUNTS.forEach(async (usr) => {
          try {
            await setDoc(doc(db, 'users', usr.id), usr);
          } catch (e) {
            console.error('Error bootstrapping user', e);
          }
        });
        setUsers(INITIAL_ACCOUNTS);
      } else {
        setUsers(usersList);
        localStorage.setItem('installments-users-v1', JSON.stringify(usersList));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    const unsubscribeClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const clientsList: ClientInstallment[] = [];
      snapshot.forEach((doc) => {
        clientsList.push(doc.data() as ClientInstallment);
      });
      if (clientsList.length === 0) {
        // Bootstrap
        INITIAL_CLIENTS.forEach(async (cl) => {
          try {
            await setDoc(doc(db, 'clients', cl.id), cl);
          } catch (e) {
            console.error('Error bootstrapping client', e);
          }
        });
        setClients(INITIAL_CLIENTS);
      } else {
        clientsList.sort((a, b) => b.id.localeCompare(a.id));
        setClients(clientsList);
        localStorage.setItem('clients-database-v2', JSON.stringify(clientsList));
      }
      setDbLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });

    return () => {
      unsubscribeUsers();
      unsubscribeClients();
    };
  }, []);

  // General dashboard controls
  const [searchTerm, setSearchTerm] = useState('');
  const [clientStatusTab, setClientStatusTab] = useState<'all' | 'active' | 'closed'>('all');
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>('all');
  const [selectedClient, setSelectedClient] = useState<ClientInstallment | null>(null);

  // Time & custom range analytics filter states
  const [dateFilterType, setDateFilterType] = useState<'all' | 'week' | 'month' | 'year' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  
  // Payment dynamic controls
  const [payAmount, setPayAmount] = useState<string>('');
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // New Client creation modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newInn, setNewInn] = useState(''); // ИНН (паспортные данные)
  const [newPhoneModel, setNewPhoneModel] = useState('');
  const [newImei, setNewImei] = useState(''); // IMEI телефона
  const [newPhonePrice, setNewPhonePrice] = useState('');
  const [newMarkupPercent, setNewMarkupPercent] = useState('15'); // 15% default markup max 50
  const [newDuration, setNewDuration] = useState('6'); // Срок рассрочки в месяцах (по умолчанию 6)
  const [newPhones, setNewPhones] = useState<string[]>(['']); // Номера телефонов заемщика
  const [customPayments, setCustomPayments] = useState<Payment[]>([]);

  const handleCustomPaymentDateChange = (index: number, newDate: string) => {
    setCustomPayments((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;

      next[index] = { ...next[index], date: newDate };

      // If editing the first payment, automatically cascade to subsequent payments month-by-month
      if (index === 0) {
        const parts = newDate.split('.');
        if (parts.length === 3) {
          const [d, m, y] = parts.map(Number);
          for (let i = 1; i < next.length; i++) {
            const date = new Date(y, m - 1, d);
            date.setMonth(date.getMonth() + i);
            const dayStr = String(date.getDate()).padStart(2, '0');
            const monStr = String(date.getMonth() + 1).padStart(2, '0');
            const yr = date.getFullYear();
            next[i] = { ...next[i], date: `${dayStr}.${monStr}.${yr}` };
          }
        }
      }
      return next;
    });
  };

  useEffect(() => {
    if (!isAddModalOpen) {
      setCustomPayments([]);
      return;
    }
    const price = parseFloat(newPhonePrice) || 0;
    const markup = parseFloat(newMarkupPercent) || 0;
    const duration = parseInt(newDuration) || 6;
    if (price <= 0 || duration <= 0) {
      setCustomPayments([]);
      return;
    }
    const calculatedTotal = price * (1 + markup / 100);
    const monthlySum = Math.round(calculatedTotal / duration);

    const generated: Payment[] = Array.from({ length: duration }).map((_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() + i + 1);
      const dayStr = String(date.getDate()).padStart(2, '0');
      const monStr = String(date.getMonth() + 1).padStart(2, '0');
      const yr = date.getFullYear();
      return {
        id: `p-gen-${Date.now()}-${i}`,
        date: `${dayStr}.${monStr}.${yr}`,
        amount: monthlySum,
        status: 'pending' as const
      };
    });
    setCustomPayments(generated);
  }, [newPhonePrice, newMarkupPercent, newDuration, isAddModalOpen]);

  // Handles helper for phones array
  const handleAddPhoneField = () => {
    setNewPhones([...newPhones, '']);
  };

  const handlePhoneChange = (index: number, value: string) => {
    const updated = [...newPhones];
    updated[index] = value;
    setNewPhones(updated);
  };

  const handleRemovePhoneField = (index: number) => {
    if (newPhones.length > 1) {
      setNewPhones(newPhones.filter((_, i) => i !== index));
    } else {
      setNewPhones(['']);
    }
  };

  // Authentication submission
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const checkLogin = login.trim().toLowerCase();
    if (!checkLogin) {
      setLoginError('Пожалуйста, введите логин');
      return;
    }
    if (!password) {
      setLoginError('Пожалуйста, введите пароль');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      const matchedUser = users.find(
        (u) => u.login.toLowerCase() === checkLogin && u.passwordHash === password
      );

      if (matchedUser) {
        setIsAuthenticated(true);
        setCurrentUser(matchedUser);
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('installments-current-user', JSON.stringify(matchedUser));
      } else {
        setLoginError('Неверный логин или пароль. Попробуйте снова.');
      }
    }, 600);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('installments-current-user');
    setLogin('');
    setPassword('');
    setSelectedClient(null);
    setActiveTab('reestr');
  };

  // Pre-fill demo login info
  const preFillDemoCreds = () => {
    setLogin('admin');
    setPassword('admin123');
    setLoginError(null);
  };

  // Create new manager/admin user account
  const handleAddUserAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPanelError(null);
    setAdminPanelSuccess(null);

    const rawLogin = newAdminLogin.trim();
    const rawPass = newAdminPassword.trim();

    if (!rawLogin || !rawPass) {
      setAdminPanelError('Логин и пароль не могут быть пустыми');
      return;
    }

    if (rawLogin.length < 3) {
      setAdminPanelError('Логин должен содержать минимум 3 символа');
      return;
    }

    if (rawPass.length < 4) {
      setAdminPanelError('Пароль должен содержать минимум 4 символа');
      return;
    }

    // Check uniqueness
    const loginExists = users.some(u => u.login.toLowerCase() === rawLogin.toLowerCase());
    if (loginExists) {
      setAdminPanelError(`Пользователь с логином "${rawLogin}" уже существует!`);
      return;
    }

    const newUser: UserAccount = {
      id: `usr-${Date.now()}`,
      login: rawLogin,
      passwordHash: rawPass,
      role: newAdminRole,
      createdAt: new Date().toLocaleDateString('ru-RU')
    };

    try {
      await setDoc(doc(db, 'users', newUser.id), newUser);
      setAdminPanelSuccess(`Изолированный кабинет "${rawLogin}" успешно создан (${newAdminRole === 'admin' ? 'Администратор платформы' : 'Кабинет арендатора / Тенант'})!`);
      
      // Reset inputs
      setNewAdminLogin('');
      setNewAdminPassword('');
      setNewAdminRole('manager');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${newUser.id}`);
      setAdminPanelError('Ошибка сохранения кабинета в Базу Данных');
    }
  };

  // Delete user account
  const handleDeleteUserAccount = async (userId: string) => {
    setAdminPanelError(null);
    setAdminPanelSuccess(null);

    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    if (targetUser.login === 'admin') {
      setAdminPanelError('Нельзя удалить главного администратора "admin"!');
      return;
    }

    if (currentUser && currentUser.id === userId) {
      setAdminPanelError('Вы не можете удалить свою собственную учетную запись!');
      return;
    }

    if (confirm(`Вы уверены, что хотите удалить пользователя "${targetUser.login}"?`)) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        setAdminPanelSuccess(`Пользователь "${targetUser.login}" успешно удален.`);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
        setAdminPanelError('Ошибка удаления из базы данных');
      }
    }
  };

  // Add new client
  const handleAddClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFirstName.trim() || !newLastName.trim() || !newInn.trim() || !newPhoneModel.trim() || !newImei.trim() || !newPhonePrice.trim()) {
      alert('Пожалуйста, заполните все поля!');
      return;
    }

    const price = parseFloat(newPhonePrice);
    const markup = parseFloat(newMarkupPercent) || 0;
    const duration = parseInt(newDuration) || 6;
    
    if (isNaN(price) || price <= 0) {
      alert('Стоимость телефона должна быть корректным числом');
      return;
    }

    if (markup < 0 || markup > 50) {
      alert('Наценка должна быть в диапазоне от 0% до 50%');
      return;
    }

    if (duration < 1 || duration > 60) {
      alert('Срок рассрочки должен быть в диапазоне от 1 до 60 месяцев');
      return;
    }

    const calculatedTotal = price * (1 + markup / 100);
    const monthlySum = Math.round(calculatedTotal / duration);

    // Use custom payments schedule edited by the user, with standard fallback if length differs
    const finalPayments = customPayments.length === duration ? customPayments : Array.from({ length: duration }).map((_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() + i + 1);
      const dayStr = String(date.getDate()).padStart(2, '0');
      const monStr = String(date.getMonth() + 1).padStart(2, '0');
      const yr = date.getFullYear();
      return {
        id: `p-gen-${Date.now()}-${i}`,
        date: `${dayStr}.${monStr}.${yr}`,
        amount: monthlySum,
        status: 'pending' as const
      };
    });

    const joinedPhones = newPhones
      .map((p) => p.trim())
      .filter((p) => p !== '')
      .join(', ');

    const newClient: ClientInstallment = {
      id: `cl-${Date.now()}`,
      tenantId: currentUser?.id || 'usr-manager1',
      firstName: newFirstName.trim(),
      lastName: newLastName.trim(),
      inn: newInn.trim(),
      phoneModel: newPhoneModel.trim(),
      phone: joinedPhones || undefined,
      imei: newImei.trim(),
      phonePrice: price,
      markupPercent: markup,
      totalRemaining: Math.round(calculatedTotal),
      payments: finalPayments,
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'clients', newClient.id), newClient);
      
      // Reset form states
      setNewFirstName('');
      setNewLastName('');
      setNewInn('');
      setNewPhoneModel('');
      setNewImei('');
      setNewPhonePrice('');
      setNewMarkupPercent('15');
      setNewDuration('6');
      setNewPhones(['']);
      setCustomPayments([]);
      setIsAddModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `clients/${newClient.id}`);
      alert('Ошибка при сохранении договора в Базу Данных');
    }
  };

  // Process payment on selected client
  const handleMakePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentSuccess(null);
    setPaymentError(null);

    if (!selectedClient) return;

    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      setPaymentError('Введите корректную сумму для списания');
      return;
    }

    if (amount > selectedClient.totalRemaining) {
      setPaymentError(`Сумма платежа превышает остаток к погашению (${selectedClient.totalRemaining.toLocaleString()} сом)`);
      return;
    }

    // Process deduction
    const remainingAfterPay = Math.max(0, selectedClient.totalRemaining - amount);
    
    // Dynamically reduce portions of payments in the schedule
    let pointsToDeduct = amount;
    const updatedSchedule = selectedClient.payments.map((p) => {
      if (p.status === 'pending' && pointsToDeduct > 0) {
        if (p.amount <= pointsToDeduct) {
          pointsToDeduct -= p.amount;
          return { ...p, status: 'paid' as const };
        } else {
          const fractionLeft = p.amount - pointsToDeduct;
          pointsToDeduct = 0;
          return { ...p, amount: Math.round(fractionLeft) };
        }
      }
      return p;
    });

    const updatedClient: ClientInstallment = {
      ...selectedClient,
      totalRemaining: remainingAfterPay,
      payments: updatedSchedule
    };

    try {
      await setDoc(doc(db, 'clients', selectedClient.id), updatedClient);
      setSelectedClient(updatedClient);
      setPaymentSuccess(`Сумма ${amount.toLocaleString()} сом успешно списана с остатка`);
      setPayAmount('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `clients/${selectedClient.id}`);
      setPaymentError('Ошибка при сохранении платежа в Базу Данных');
    }
  };

  // 1. ISOLATED TENANT FILTERING (The core multi-tenant engine) with integrated Date & Period filter
  const tenantFilteredClients = useMemo(() => {
    if (!currentUser) return [];
    
    // First, isolate database records by user role and selected tenant filter
    let baseClients: ClientInstallment[] = [];
    if (currentUser.role === 'admin') {
      if (selectedTenantFilter === 'all') {
        baseClients = clients;
      } else {
        baseClients = clients.filter(c => c.tenantId === selectedTenantFilter);
      }
    } else {
      baseClients = clients.filter(c => c.tenantId === currentUser.id);
    }

    // Second, apply time-range filters (week, month, year, custom range)
    const now = new Date();
    return baseClients.filter(c => {
      const createdAt = getClientCreatedAt(c);
      
      if (dateFilterType === 'week') {
        const diffTime = now.getTime() - createdAt.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 7;
      }
      
      if (dateFilterType === 'month') {
        const diffTime = now.getTime() - createdAt.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 30;
      }
      
      if (dateFilterType === 'year') {
        const diffTime = now.getTime() - createdAt.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 365;
      }
      
      if (dateFilterType === 'custom') {
        if (customStartDate) {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          if (createdAt < start) return false;
        }
        if (customEndDate) {
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          if (createdAt > end) return false;
        }
        return true;
      }
      
      return true; // 'all'
    });
  }, [clients, currentUser, selectedTenantFilter, dateFilterType, customStartDate, customEndDate]);

  // 2. Search query filter applied on the isolated/active tenant dataset
  const filteredClients = useMemo(() => {
    return tenantFilteredClients.filter((c) => {
      // Filter by status tab (active / closed)
      if (clientStatusTab === 'active' && c.totalRemaining === 0) return false;
      if (clientStatusTab === 'closed' && c.totalRemaining > 0) return false;

      const combined = `${c.firstName} ${c.lastName} ${c.phoneModel} ${c.imei} ${c.inn} ${c.phone || ''}`.toLowerCase();
      return combined.includes(searchTerm.toLowerCase());
    });
  }, [tenantFilteredClients, searchTerm, clientStatusTab]);

  // 3. Compute detailed profit metrics / margins (total margins, earned margin, scheduled expected margin)
  const marginMetrics = useMemo(() => {
    let total = 0;
    let earned = 0;
    let expected = 0;
    tenantFilteredClients.forEach((c) => {
      const marginTotal = Math.round(c.phonePrice * (c.markupPercent / 100));
      const totalCost = Math.round(c.phonePrice * (1 + c.markupPercent / 100));
      const marginExpected = totalCost > 0 ? Math.round((c.totalRemaining / totalCost) * marginTotal) : 0;
      const marginEarned = Math.max(0, marginTotal - marginExpected);

      total += marginTotal;
      earned += marginEarned;
      expected += marginExpected;
    });
    return { total, earned, expected };
  }, [tenantFilteredClients]);

  return (
    <div className="min-h-screen bg-[#F6F6F9] text-stone-900 flex flex-col font-sans selection:bg-stone-900 selection:text-white antialiased">
      
      {/* Neutral Clean Header without "РассрочкаКонтроль" */}
      <header className="bg-white border-b border-stone-200/60 py-3.5 px-4 sm:px-6 sticky top-0 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.01)] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center justify-between md:justify-start gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-stone-900 flex items-center justify-center">
              <Coins className="w-4.5 h-4.5 text-stone-50" strokeWidth={2} />
            </div>
            <span className="font-semibold tracking-tight text-stone-900 text-sm md:text-base">Учет рассрочек</span>
          </div>

          {isAuthenticated && currentUser && (
            <div className="flex items-center gap-1.5 bg-stone-50 px-2.5 py-1 rounded-xl border border-stone-150">
              <UserCheck className="w-3.5 h-3.5 text-stone-550" />
              <span className="text-[11px] font-bold text-stone-700 capitalize">
                {currentUser.login}
              </span>
              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                currentUser.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-stone-200 text-stone-700'
              }`}>
                {currentUser.role === 'admin' ? 'Админ' : 'Менеджер'}
              </span>
            </div>
          )}
        </div>

        {isAuthenticated && (
          <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto">
            {/* Tabs Selector for Admin mode */}
            <div className="flex items-center bg-stone-50 p-1 rounded-xl border border-stone-150 text-xs shadow-inner">
              <button
                onClick={() => {
                  setActiveTab('reestr');
                  setSelectedClient(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold tracking-tight transition-all cursor-pointer ${
                  activeTab === 'reestr'
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'text-stone-550 hover:text-stone-850 hover:bg-stone-105/50'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Реестр</span>
              </button>

              {/* Access to Admin-management only for admins */}
              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => {
                    setActiveTab('users');
                    setSelectedClient(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold tracking-tight transition-all cursor-pointer ${
                    activeTab === 'users'
                      ? 'bg-stone-900 text-white shadow-sm'
                      : 'text-stone-550 hover:text-stone-850 hover:bg-stone-105/50'
                  }`}
                  id="tab_access_control"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Управление заходами (Админка)</span>
                </button>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="text-xs font-bold px-3 py-2 bg-stone-50 hover:bg-red-50/50 hover:text-red-750 hover:border-red-150 text-stone-600 border border-stone-200/75 rounded-lg inline-flex items-center gap-1.5 transition-all cursor-pointer"
              id="btn_logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Выйти</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Layout Workspace Wrapper */}
      <main className="flex-1 flex flex-col">
        {!isAuthenticated ? (
          /* LOGIN SCREEN: PURE MINIMALIST WITH DUAL PASSWORD & USERNAME FLOW */
          <div className="flex-1 flex flex-col items-center justify-center p-4 bg-stone-50">
            <div className="w-full max-w-[350px]">
              
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-2xl border border-stone-200/50 p-6 md:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.02)]"
                id="login_card"
              >
                <div className="mb-6">
                  <h2 className="text-xl font-bold tracking-tight text-stone-900">Кабинет учета</h2>
                  <p className="text-xs text-stone-400 mt-1">Доступ к договорам заемщиков</p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  {/* Login input */}
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5" htmlFor="field_username">
                      Логин
                    </label>
                    <input
                      id="field_username"
                      type="text"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      placeholder="логин"
                      disabled={isLoading}
                      className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200/80 rounded-xl text-sm placeholder:text-stone-300 hover:border-stone-300 focus:bg-white focus:border-stone-900 focus:ring-4 focus:ring-stone-100 transition-all outline-none"
                    />
                  </div>

                  {/* Password input */}
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5" htmlFor="field_secure_pass">
                      Пароль
                    </label>
                    <div className="relative">
                      <input
                        id="field_secure_pass"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        disabled={isLoading}
                        className="w-full pl-3.5 pr-10 py-2.5 bg-stone-50 border border-stone-200/80 rounded-xl text-sm placeholder:text-stone-300/60 hover:border-stone-300 focus:bg-white focus:border-stone-900 focus:ring-4 focus:ring-stone-100 transition-all outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-stone-300 hover:text-stone-600 transition-colors"
                        id="btn_password_toggle"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Feedback Notifications */}
                  {loginError && (
                    <div className="text-xs p-3 bg-red-50 text-red-800 border border-red-100 rounded-lg" id="login_error_alert">
                      {loginError}
                    </div>
                  )}

                  <button
                    id="btn_signin"
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-stone-900 text-stone-50 hover:bg-stone-800 active:bg-stone-950 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <span>{isLoading ? 'Загрузка...' : 'Войти'}</span>
                    {!isLoading && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>



              </motion.div>
            </div>
          </div>
        ) : activeTab === 'users' && currentUser?.role === 'admin' ? (
          /* ADMIN USER ACCOUNTS MANAGEMENT WORKSPACE */
          <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-5">
            {/* Header */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/50 shadow-[0_2px_12px_rgba(0,0,0,0.015)]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-800 shrink-0">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">Панель управления арендаторами (Тенанты)</h1>
                    <p className="text-xs text-stone-500 leading-relaxed mt-0.5">
                      Создание индивидуальных изолированных кабинетов и настройка паролей доступа для магазинов и дилеров.
                    </p>
                  </div>
                </div>
 
                <button
                  onClick={() => {
                    setActiveTab('reestr');
                  }}
                  className="py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-stone-200/50"
                  id="btn_back_to_reestr"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Вернуться в реестр</span>
                </button>
              </div>
            </div>
 
            {/* Panels Container */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Form creation account */}
              <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-stone-200/50 shadow-[0_2px_12px_rgba(0,0,0,0.01)] space-y-4">
                <div className="pb-3 border-b border-stone-100 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-stone-555" />
                  <h2 className="text-sm font-bold text-stone-800 uppercase tracking-tight">Новый кабинет арендатора (Тенант)</h2>
                </div>
 
                <form onSubmit={handleAddUserAccount} className="space-y-3.5">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1 font-sans">Логин для входа</label>
                    <input
                      type="text"
                      required
                      placeholder="Например, rustam_k"
                      value={newAdminLogin}
                      onChange={(e) => setNewAdminLogin(e.target.value.replace(/\s+/g, ''))}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-xs hover:border-stone-300 focus:outline-none focus:border-stone-900 font-medium"
                      id="input_admin_new_login"
                    />
                    <p className="text-[9px] text-stone-400 mt-0.5">Вводить латинскими буквами без пробелов</p>
                  </div>
 
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1 font-sans">Пароль для входа</label>
                    <input
                      type="text"
                      required
                      placeholder="Например, strongPass77"
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-xs hover:border-stone-300 focus:outline-none focus:border-stone-900 font-mono"
                      id="input_admin_new_password"
                    />
                  </div>
 
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1 font-sans">Тип кабинета в системе</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setNewAdminRole('manager')}
                        className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                          newAdminRole === 'manager'
                            ? 'bg-stone-900 text-stone-50 border-stone-900 shadow-sm'
                            : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
                        }`}
                        id="btn_role_manager"
                      >
                        Тенант (Магазин)
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewAdminRole('admin')}
                        className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                          newAdminRole === 'admin'
                            ? 'bg-amber-600 border-amber-600 text-amber-50 shadow-sm'
                            : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
                        }`}
                        id="btn_role_admin"
                      >
                        Админ платформ.
                      </button>
                    </div>
                    <p className="text-[9px] text-stone-400 mt-1.5 italic leading-relaxed">
                      * Тенанты (Магазины) ведут полностью независимый, изолированный учет клиентов рассрочки. Они не видят чужие данные и не имеют доступа в эту панель настроек.
                    </p>
                  </div>
 
                  {/* Errors & Alerts */}
                  {adminPanelError && (
                    <div className="p-2.5 bg-red-50 text-red-800 border border-red-100 rounded-lg text-xs font-medium" id="alert_admin_error">
                      {adminPanelError}
                    </div>
                  )}
 
                  {adminPanelSuccess && (
                    <div className="p-2.5 bg-emerald-50 text-emerald-850 border border-emerald-110 rounded-lg text-xs font-medium" id="alert_admin_success">
                      {adminPanelSuccess}
                    </div>
                  )}
 
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-stone-900 hover:bg-stone-850 active:bg-stone-950 text-stone-50 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 tracking-tight transition-all cursor-pointer shadow-sm"
                    id="btn_admin_add_user_submit"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Создать кабинет тенанта</span>
                  </button>
                </form>
              </div>
 
              {/* Accounts List */}
              <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-stone-200/50 shadow-[0_2px_12px_rgba(0,0,0,0.01)] space-y-4">
                <div className="pb-3 border-b border-stone-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-stone-500" />
                    <h2 className="text-sm font-bold text-stone-800 uppercase tracking-tight">Кабинеты и доступы ({users.length})</h2>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-stone-400">База данных: Хранилище</span>
                </div>

                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {users.map((acc) => {
                    const isSelf = currentUser?.id === acc.id;
                    const isSuperadmin = acc.login === 'admin';
                    
                    return (
                      <div
                        key={acc.id}
                        className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                          isSelf 
                            ? 'bg-amber-50/40 border-amber-200/60 shadow-[0_1px_2px_rgba(245,158,11,0.02)]' 
                            : 'bg-stone-50/60 border-stone-200/65'
                        }`}
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-1.5">
                            <span className="font-bold text-xs text-stone-850 font-mono tracking-tight">{acc.login}</span>
                            {isSuperadmin && (
                              <span className="text-[8px] font-extrabold bg-stone-900 text-stone-100 px-1.5 py-0.5 rounded uppercase tracking-wider">Супер</span>
                            )}
                            {isSelf && (
                              <span className="text-[8px] font-extrabold bg-amber-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">Это Вы</span>
                            )}
                            <span className={`text-[8.5px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                              acc.role === 'admin' ? 'bg-amber-100 text-amber-850 border border-amber-200/50' : 'bg-stone-205 text-stone-705'
                            }`}>
                              {acc.role === 'admin' ? 'Администратор' : 'Менеджер'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-stone-500">
                            <KeyRound className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span>Пароль:</span>
                            <span className="font-extrabold text-stone-800 bg-white border border-stone-200 px-2 py-0.5 rounded text-[11px]">
                              {acc.passwordHash}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="hidden sm:block text-right select-none pr-1">
                            <span className="text-[8.5px] font-bold text-stone-400 block uppercase">Создан</span>
                            <span className="text-[10px] font-mono text-stone-500">{acc.createdAt || 'Мгновенно'}</span>
                          </div>

                          {!isSuperadmin && !isSelf && (
                            <button
                              onClick={() => handleDeleteUserAccount(acc.id)}
                              className="p-1.5 bg-white hover:bg-red-50 text-stone-400 hover:text-red-650 border border-stone-200 hover:border-red-150 rounded-lg transition-colors cursor-pointer"
                              title="Удалить аккаунт"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* INSIDE INTERACTION SCREEN ("внутрянка") - LIST & DETAILS OF INSTALLMENTS */
          <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-4">
            
            {/* Top Dashboard Header Stats - Desktop vs Mobile Title */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/50 shadow-[0_2px_12px_rgba(0,0,0,0.015)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">Реестр заемщиков</h1>
                  <p className="text-xs text-stone-500 leading-relaxed mt-0.5 max-w-md">
                    Учет выданных девайсов в рассрочку, графиков погашения и остатков в сомах (Кыргызстан).
                  </p>
                </div>

                {/* Action: Open New Client Form drawer */}
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="py-2.5 px-4 bg-stone-900 hover:bg-stone-850 active:bg-stone-950 text-stone-50 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 tracking-tight transition-all cursor-pointer shadow-sm shrink-0"
                  id="btn_add_client_trigger"
                >
                  <Plus className="w-4 h-4" />
                  <span>Новый заемщик</span>
                </button>
              </div>

              {/* Date & Analytics Filter Bar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-stone-50 p-3 rounded-xl border border-stone-200/60 text-xs shadow-xxs">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="font-bold text-stone-500 uppercase tracking-wider text-[10px]">Период создания:</span>
                  <div className="flex flex-wrap gap-1 p-0.5 bg-stone-200/60 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setDateFilterType('all');
                        setSelectedClient(null);
                      }}
                      className={`px-3 py-1 py-1.5 rounded-md font-sans font-bold transition-all text-[11px] cursor-pointer ${
                        dateFilterType === 'all'
                          ? 'bg-stone-900 text-stone-50 shadow-xxs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Все время
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDateFilterType('week');
                        setSelectedClient(null);
                      }}
                      className={`px-3 py-1 py-1.5 rounded-md font-sans font-bold transition-all text-[11px] cursor-pointer ${
                        dateFilterType === 'week'
                          ? 'bg-stone-900 text-stone-50 shadow-xxs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Неделя
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDateFilterType('month');
                        setSelectedClient(null);
                      }}
                      className={`px-3 py-1 py-1.5 rounded-md font-sans font-bold transition-all text-[11px] cursor-pointer ${
                        dateFilterType === 'month'
                          ? 'bg-stone-900 text-stone-50 shadow-xxs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Месяц
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDateFilterType('year');
                        setSelectedClient(null);
                      }}
                      className={`px-3 py-1 py-1.5 rounded-md font-sans font-bold transition-all text-[11px] cursor-pointer ${
                        dateFilterType === 'year'
                          ? 'bg-stone-900 text-stone-50 shadow-xxs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Год
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDateFilterType('custom');
                        setSelectedClient(null);
                      }}
                      className={`px-3 py-1.5 rounded-md font-sans font-bold transition-all text-[11px] cursor-pointer ${
                        dateFilterType === 'custom'
                          ? 'bg-stone-900 text-stone-50 shadow-xxs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Выбрать период
                    </button>
                  </div>
                </div>

                {dateFilterType === 'custom' && (
                  <div className="flex flex-wrap items-center gap-2.5 animate-fadeIn font-medium text-stone-600">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-stone-400">С:</span>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => {
                          setCustomStartDate(e.target.value);
                          setSelectedClient(null);
                        }}
                        className="px-2.5 py-1.5 border border-stone-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-stone-950 font-mono bg-white shadow-xxs cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-stone-400">По:</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => {
                          setCustomEndDate(e.target.value);
                          setSelectedClient(null);
                        }}
                        className="px-2.5 py-1.5 border border-stone-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-stone-950 font-mono bg-white shadow-xxs cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Portfolio Summary Widgets (Highly Requested UX Improvement) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1 border-t border-stone-100">
                <div className="bg-stone-50/60 p-3 rounded-xl border border-stone-150/40 text-left">
                  <span className="text-[10px] text-stone-450 font-bold uppercase tracking-wider block">Договоров</span>
                  <p className="text-base sm:text-lg font-mono font-bold text-stone-900 mt-0.5">{tenantFilteredClients.length}</p>
                </div>
                <div className="bg-stone-50/60 p-3 rounded-xl border border-stone-150/40 text-left">
                  <span className="text-[10px] text-stone-450 font-bold uppercase tracking-wider block">Активных</span>
                  <p className="text-base sm:text-lg font-mono font-bold text-stone-900 mt-0.5">
                    {tenantFilteredClients.filter(c => c.totalRemaining > 0).length}
                  </p>
                </div>
                <div className="bg-stone-900 p-3 rounded-xl text-left text-white col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-stone-300 font-bold uppercase tracking-wider block">Остаток долга</span>
                  <p className="text-base sm:text-lg font-mono font-bold text-stone-50 mt-0.5 truncate">
                    {tenantFilteredClients.reduce((sum, c) => sum + c.totalRemaining, 0).toLocaleString()} сом
                  </p>
                </div>
                <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-100 text-left col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block">Закрытых</span>
                  <p className="text-base sm:text-lg font-mono font-bold text-emerald-800 mt-0.5">
                    {tenantFilteredClients.filter(c => c.totalRemaining === 0).length}
                  </p>
                </div>
              </div>

              {/* Margin & Earnings Summary Widgets */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-dotted border-stone-200">
                <div className="bg-emerald-50/30 p-3 rounded-xl border border-emerald-100 text-left">
                  <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider block">Общая маржа (наценка)</span>
                  <p className="text-base sm:text-lg font-mono font-bold text-emerald-900 mt-0.5">
                    {marginMetrics.total.toLocaleString()} сом
                  </p>
                  <span className="text-[9px] text-stone-400 block mt-0.5 font-medium">Общий потенциальный доход</span>
                </div>
                <div className="bg-emerald-600 p-3 rounded-xl text-left text-emerald-50 shadow-xs">
                  <span className="text-[10px] text-emerald-200 font-bold uppercase tracking-wider block">Уже заработано (выплачено)</span>
                  <p className="text-base sm:text-lg font-mono font-bold text-white mt-0.5">
                    {marginMetrics.earned.toLocaleString()} сом
                  </p>
                  <span className="text-[9px] text-emerald-200/80 block mt-0.5 font-medium">Списанная доля наценки</span>
                </div>
                <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/80 text-left">
                  <span className="text-[10px] text-stone-550 font-bold uppercase tracking-wider block">Ожидается заработать</span>
                  <p className="text-base sm:text-lg font-mono font-bold text-stone-850 mt-0.5">
                    {marginMetrics.expected.toLocaleString()} сом
                  </p>
                  <span className="text-[9px] text-stone-400 block mt-0.5 font-medium">Маржа в активных договорах</span>
                </div>
              </div>
            </div>

            {/* Multi-tenant selector bar ONLY for platforms admins */}
            {currentUser?.role === 'admin' && (
              <div className="bg-amber-50/40 border border-amber-200/40 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs animate-fadeIn shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="font-bold text-stone-700">Фильтр по кабинету (Мультитендерный режим):</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => {
                      setSelectedTenantFilter('all');
                      setSelectedClient(null);
                    }}
                    className={`px-3 py-1.5 rounded-md border font-sans text-xs font-bold transition-all cursor-pointer ${
                      selectedTenantFilter === 'all'
                        ? 'bg-stone-900 border-stone-900 text-stone-50 shadow-sm'
                        : 'bg-white hover:bg-stone-100 border-stone-200 text-stone-650'
                    }`}
                  >
                    Все кабинеты ({clients.length})
                  </button>
                  {users.filter(u => u.role === 'manager').map(u => {
                    const count = clients.filter(c => c.tenantId === u.id).length;
                    return (
                      <button
                        key={u.id}
                        onClick={() => {
                          setSelectedTenantFilter(u.id);
                          setSelectedClient(null);
                        }}
                        className={`px-3 py-1.5 rounded-md border font-sans text-xs font-bold transition-all cursor-pointer ${
                          selectedTenantFilter === u.id
                            ? 'bg-amber-600 border-amber-600 text-amber-50 shadow-sm'
                            : 'bg-white hover:bg-stone-105 border-stone-200 text-stone-650'
                        }`}
                      >
                        Магазин: {u.login} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Simple Dynamic Search Filter Bar (Adaptive Layout) */}
            {(!selectedClient || window.innerWidth >= 1024) && (
              <div className="relative animate-fadeIn">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-450 pointer-events-none">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Поиск по фамилии, ИНН, телефону или IMEI..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-sm placeholder:text-stone-400 focus:outline-none focus:border-stone-900 focus:ring-4 focus:ring-stone-100 transition-all font-medium"
                  id="search_clients"
                />
              </div>
            )}

            {/* Split Screen Panel for Desktop, layout adapted dynamically for phones */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              
              {/* Clients Sidebar List. Omit/Hide on mobile if detailed view is open */}
              <div className={`lg:col-span-6 space-y-2.5 ${selectedClient ? 'hidden lg:block' : 'block'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                    Договоры ({filteredClients.length})
                  </span>
                  
                  {/* Status selection tabs */}
                  <div className="bg-stone-200/80 p-0.5 rounded-lg flex items-center text-[10px] font-bold font-sans self-start sm:self-auto shadow-xxs">
                    <button
                      type="button"
                      onClick={() => {
                        setClientStatusTab('all');
                        setSelectedClient(null);
                      }}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        clientStatusTab === 'all'
                          ? 'bg-stone-900 text-stone-50 shadow-xxs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Все ({tenantFilteredClients.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setClientStatusTab('active');
                        setSelectedClient(null);
                      }}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        clientStatusTab === 'active'
                          ? 'bg-amber-500 text-amber-950 shadow-xxs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Активные ({tenantFilteredClients.filter(c => c.totalRemaining > 0).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setClientStatusTab('closed');
                        setSelectedClient(null);
                      }}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        clientStatusTab === 'closed'
                          ? 'bg-emerald-600 text-emerald-50 shadow-xxs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Закрытые ({tenantFilteredClients.filter(c => c.totalRemaining === 0).length})
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {filteredClients.length === 0 ? (
                    <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-400 text-xs flex flex-col items-center justify-center gap-2">
                      <Inbox className="w-8 h-8 text-stone-300" />
                      <span>Никого не найдено в этой вкладке</span>
                    </div>
                  ) : (
                    filteredClients.map((client) => {
                      const isSelected = selectedClient?.id === client.id;
                      return (
                        <div
                          key={client.id}
                          onClick={() => {
                            setSelectedClient(client);
                            setPaymentSuccess(null);
                            setPaymentError(null);
                            setPayAmount('');
                          }}
                          className={`p-4 rounded-xl border text-left cursor-pointer transition-all duration-150 relative overflow-hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                            isSelected 
                              ? 'bg-stone-900 text-stone-50 border-stone-900 shadow-md ring-2 ring-stone-900/10' 
                              : 'bg-white text-stone-950 border-stone-200 hover:border-stone-300 shadow-[0_1px_2px_rgba(0,0,0,0.015)]'
                          }`}
                          id={`client_card_${client.id}`}
                        >
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center flex-wrap gap-1.5">
                              <span className="font-bold text-sm truncate">
                                {client.lastName} {client.firstName}
                              </span>
                              {client.totalRemaining === 0 ? (
                                <span className={`text-[9.5px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                                  isSelected ? 'bg-emerald-950 text-emerald-300 border border-emerald-900/40' : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  Закрыт
                                </span>
                              ) : (
                                <span className={`text-[9.5px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                                  isSelected ? 'bg-stone-850 text-stone-300 border border-stone-700/60' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  Активен
                                </span>
                              )}
                              {currentUser?.role === 'admin' && (
                                <span className={`text-[9.5px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                                  isSelected ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30' : 'bg-stone-100 text-stone-600 border border-stone-200/50'
                                }`}>
                                  Кабинет: {users.find(u => u.id === client.tenantId)?.login || 'default'}
                                </span>
                              )}
                            </div>
                            
                            <div className="pt-0.5 select-none flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-lg border font-sans font-bold tracking-tight inline-flex items-center gap-1.5 ${
                                isSelected 
                                  ? 'bg-amber-400 border-amber-400 text-stone-950 shadow-sm' 
                                  : 'bg-stone-50 text-stone-700 border-stone-200/60'
                              }`}>
                                <Smartphone className="w-3.5 h-3.5 shrink-0 text-stone-500" />
                                <span>Модель: {client.phoneModel}</span>
                              </span>
                            </div>

                            <div className="flex flex-col gap-0.5 text-[11px] font-mono leading-none pt-0.5">
                              <span className={isSelected ? 'text-stone-400' : 'text-stone-500'}>
                                ИНН (Паспорт): {client.inn}
                              </span>
                              <span className={isSelected ? 'text-stone-400' : 'text-stone-500'}>
                                IMEI телефона: {client.imei}
                              </span>
                              {client.phone && (
                                <span className={`flex items-center gap-1 mt-1 font-sans ${isSelected ? 'text-stone-300' : 'text-stone-500'}`}>
                                  <Phone className="w-3.5 h-3.5 text-stone-450 shrink-0" />
                                  <span className="truncate">{client.phone}</span>
                                </span>
                              )}
                            </div>

                            {/* Forever Visible Margin display */}
                            <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                              <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 tracking-tight border ${
                                isSelected 
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60' 
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-100'
                              }`}>
                                Маржа (доход): +{Math.round(client.phonePrice * (client.markupPercent / 100)).toLocaleString()} сом
                              </span>
                              <span className={`text-[9.5px] font-mono ${isSelected ? 'text-stone-400' : 'text-stone-500'}`}>
                                (наценка {client.markupPercent}%)
                              </span>
                            </div>
                          </div>

                          {/* Price metrics */}
                          <div className="sm:text-right flex sm:flex-col justify-between sm:justify-center items-center sm:items-end border-t sm:border-t-0 border-stone-100/10 pt-2.5 sm:pt-0 shrink-0">
                            <span className={`text-[10px] sm:text-[9px] font-semibold uppercase tracking-wider ${isSelected ? 'text-stone-400' : 'text-stone-500'}`}>
                              Остаток к погашению
                            </span>
                            <span className="text-sm sm:text-base font-bold font-mono tracking-tight text-right">
                              {client.totalRemaining.toLocaleString()}&nbsp;сом
                            </span>
                          </div>

                          <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 sm:opacity-100 pointer-events-none pl-2">
                            <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-stone-400' : 'text-stone-300'}`} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Client Detail & Installment Schedule Panel. Omit/Hide on mobile if selectedClient is NULL */}
              <div className={`lg:col-span-6 ${!selectedClient ? 'hidden lg:block' : 'block'}`}>
                {selectedClient ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white rounded-2xl border border-stone-200/80 p-4 sm:p-6 space-y-5 shadow-sm"
                    id="client_details_view"
                  >
                    {/* Back to list button on MOBILE layout only */}
                    <div className="block lg:hidden border-b border-stone-100 pb-3">
                      <button
                        onClick={() => setSelectedClient(null)}
                        className="py-1.5 px-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        id="btn_back_to_list"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Назад к списку клиентов</span>
                      </button>
                    </div>

                    {/* Person Details Header */}
                    <div className="flex justify-between items-start border-b border-stone-100 pb-4">
                      <div className="space-y-1 min-w-0">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                          Детальное досье заемщика
                        </span>
                        <h2 className="text-base sm:text-lg font-bold text-stone-900 leading-tight truncate">
                          {selectedClient.lastName} {selectedClient.firstName}
                        </h2>
                        <div className="text-xs text-stone-500 font-medium space-y-0.5 pt-0.5">
                          <p className="flex items-center gap-1 bg-stone-50 p-1 px-2 rounded-md sm:inline-flex border border-stone-150/40">
                            <strong>Девайс:</strong> {selectedClient.phoneModel}
                          </p>
                          <p className="font-mono text-[11px] text-stone-800">
                            <strong>IMEI телефона:</strong> {selectedClient.imei}
                          </p>
                          {currentUser?.role === 'admin' && (
                            <div className="pt-1.5">
                              <span className="font-mono text-[11px] text-amber-850 font-bold bg-amber-50/70 border border-amber-200/50 rounded-lg px-2.5 py-1.5 inline-block">
                                <strong>Владелец договора:</strong> {users.find(u => u.id === selectedClient.tenantId)?.login || 'По умолчанию'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <button 
                        onClick={() => setSelectedClient(null)}
                        className="p-1 px-1.5 bg-stone-50 hover:bg-stone-100 text-stone-500 rounded-md text-xs font-semibold cursor-pointer hidden lg:block"
                      >
                        Свернуть
                      </button>
                    </div>

                    {/* Hardware purchase summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-stone-50 rounded-xl p-2.5 text-left border border-stone-150/50">
                        <span className="text-[9px] text-stone-450 font-semibold block uppercase tracking-wider mb-0.5">Цена</span>
                        <span className="text-xs sm:text-sm font-bold font-mono text-stone-900 leading-none">
                          {selectedClient.phonePrice.toLocaleString()}&nbsp;с.
                        </span>
                      </div>
                      <div className="bg-stone-50 rounded-xl p-2.5 text-left border border-stone-150/50">
                        <span className="text-[9px] text-stone-450 font-semibold block uppercase tracking-wider mb-0.5">Наценка</span>
                        <span className="text-xs sm:text-sm font-bold font-mono text-stone-900 leading-none flex items-center gap-0.5">
                          {selectedClient.markupPercent}% 
                          <Percent className="w-3 h-3 text-stone-400" />
                        </span>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-2.5 text-left border border-emerald-100">
                        <span className="text-[9px] text-emerald-705 font-bold block uppercase tracking-wider mb-0.5">Маржа</span>
                        <span className="text-xs sm:text-sm font-bold font-mono text-emerald-800 leading-none">
                          +{Math.round(selectedClient.phonePrice * (selectedClient.markupPercent / 100)).toLocaleString()}&nbsp;с.
                        </span>
                      </div>
                      <div className="bg-stone-900 rounded-xl p-2.5 text-left">
                        <span className="text-[9px] text-stone-300 font-semibold block uppercase tracking-wider mb-0.5">Остаток</span>
                        <span className="text-xs sm:text-sm font-bold font-mono text-stone-50 leading-none">
                          {selectedClient.totalRemaining.toLocaleString()}&nbsp;с.
                        </span>
                      </div>
                    </div>

                    {/* Identifiers - Single Combined Line */}
                    <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/50 text-xs space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">ИНН / Паспорт заемщика</span>
                        <span className="font-mono font-bold text-stone-800">{selectedClient.inn}</span>
                      </div>
                      
                      {selectedClient.phone && (
                        <div className="pt-3 border-t border-stone-200/50 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-stone-450 uppercase tracking-wider">Контакты телефона заемщика</span>
                            <span className="text-[9px] bg-stone-200/50 text-stone-600 px-1.5 py-0.5 rounded font-mono font-semibold">Связь в 1 клик</span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {selectedClient.phone.split(',').map((phoneStr, idx) => {
                              const trimmed = phoneStr.trim();
                              if (!trimmed) return null;
                              const digits = trimmed.replace(/\D/g, '');
                              const hasDigits = digits.length > 0;
                              return (
                                <div key={idx} className="bg-white border border-stone-200 rounded-xl p-2.5 space-y-2 flex flex-col justify-between shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:border-stone-300 transition-all">
                                  <div className="flex items-center gap-1.5">
                                    <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                    <span className="font-mono text-xs font-bold text-stone-800">{trimmed}</span>
                                  </div>
                                  <div className="flex gap-1.5">
                                    <a
                                      href={`tel:${trimmed}`}
                                      className="flex-1 py-2 px-2.5 bg-stone-50 hover:bg-stone-100 text-stone-700 hover:text-stone-900 font-bold text-[11px] rounded-lg border border-stone-200 shrink-0 flex items-center justify-center gap-1 active:bg-stone-200 transition-colors"
                                    >
                                      <span>Позвонить</span>
                                    </a>
                                    {hasDigits && (
                                      <a
                                        href={`https://wa.me/${digits}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 py-2 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 hover:text-emerald-900 font-bold text-[11px] rounded-lg border border-emerald-100 shrink-0 flex items-center justify-center gap-1 transition-all"
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        <span>WhatsApp</span>
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Payment deduction action panel */}
                    {selectedClient.totalRemaining > 0 ? (
                      <div className="bg-[#FAF9FB] border border-stone-200 rounded-2xl p-4 space-y-3.5">
                        <div className="space-y-0.5">
                          <h3 className="text-xs sm:text-sm font-bold text-stone-950">Погашение рассрочки</h3>
                          <p className="text-[11px] text-stone-450">Сумма спишется из остатка долга и пересчитает платежи</p>
                        </div>

                        <form onSubmit={handleMakePayment} className="flex gap-2">
                          <div className="relative flex-1 min-w-0">
                            <input
                              type="number"
                              pattern="[0-9]*"
                              inputMode="numeric"
                              placeholder="Введите сумму, сом"
                              value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                              className="w-full pl-3 pr-8 py-2 bg-white border border-stone-250 rounded-xl text-xs sm:text-sm placeholder:text-stone-300 hover:border-stone-400 focus:outline-none focus:border-stone-900 transition-all font-semibold font-mono"
                            />
                            <span className="absolute inset-y-0 right-3 flex items-center text-stone-400 text-xs font-semibold">сом</span>
                          </div>
                          
                          <button
                            type="submit"
                            className="py-2 px-4 bg-stone-900 hover:bg-stone-800 active:bg-stone-950 text-stone-50 rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-colors"
                            id="btn_apply_payment"
                          >
                            Погасить
                          </button>
                        </form>

                        {/* Quick shortcuts buttons - Adaptive wrapping */}
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPayAmount('5000')}
                            className="text-[10px] px-2 py-1 bg-white hover:bg-stone-100 border border-stone-200 text-stone-600 font-semibold rounded-lg transition-colors cursor-pointer"
                          >
                            5 000 сом
                          </button>
                          <button
                            type="button"
                            onClick={() => setPayAmount('15000')}
                            className="text-[10px] px-2 py-1 bg-white hover:bg-stone-100 border border-stone-200 text-stone-600 font-semibold rounded-lg transition-colors cursor-pointer"
                          >
                            15 000 сом
                          </button>
                          <button
                            type="button"
                            onClick={() => setPayAmount(String(selectedClient.totalRemaining))}
                            className="text-[10px] px-2.5 py-1 bg-white hover:bg-stone-100 border border-stone-200 text-stone-800 font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            Весь долг ({selectedClient.totalRemaining.toLocaleString()} с.)
                          </button>
                        </div>

                        {/* Status notifications */}
                        {paymentSuccess && (
                          <div className="p-3 bg-stone-950 text-stone-50 border border-stone-800 rounded-xl text-[11px] flex items-start gap-2 animate-fadeIn">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{paymentSuccess}</span>
                          </div>
                        )}

                        {paymentError && (
                          <div className="p-3 bg-rose-50 text-rose-900 border border-rose-100 rounded-xl text-[11px] font-medium animate-fadeIn">
                            {paymentError}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-emerald-50 text-emerald-950 border border-emerald-100 rounded-2xl p-4 text-center flex flex-col items-center gap-1.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <p className="text-xs sm:text-sm font-semibold">Рассрочка за этот телефон полностью закрыта!</p>
                        <p className="text-[10px] text-emerald-700">Остаток составляет 0 сом.</p>
                      </div>
                    )}

                    {/* Payment Schedule List */}
                    <div className="space-y-2">
                      <h3 className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                        График погашения задолженности
                      </h3>

                      <div className="border border-stone-200/60 rounded-xl divide-y divide-stone-150 overflow-hidden bg-white shadow-xs">
                        {selectedClient.payments.map((p, index) => {
                          const isPastPaid = p.status === 'paid' || selectedClient.totalRemaining === 0;
                          return (
                            <div 
                              key={p.id} 
                              className={`p-3 px-3.5 flex justify-between items-center text-xs transition-colors ${
                                isPastPaid ? 'bg-stone-50/70' : 'bg-white'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <span className="text-stone-450 font-semibold mr-1.5">{index + 1} платеж</span>
                                <span className="font-mono text-stone-600">{p.date}</span>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className={`font-mono font-bold ${isPastPaid ? 'line-through text-stone-300' : 'text-stone-800'}`}>
                                  {p.amount.toLocaleString()}&nbsp;с.
                                </span>

                                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                  isPastPaid 
                                    ? 'bg-stone-100 text-stone-400' 
                                    : 'bg-stone-900 text-stone-50'
                                }`}>
                                  {isPastPaid ? 'Оплачено' : 'Ожидает'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </motion.div>
                ) : (
                  <div className="bg-white rounded-2xl border border-stone-200/80 p-8 text-center text-stone-400 text-xs flex flex-col items-center justify-center gap-3 h-[300px] shadow-xs">
                    <div className="w-10 h-10 rounded-xl bg-stone-50 border border-stone-100 flex items-center justify-center">
                      <CreditCard className="w-4.5 h-4.5 text-stone-450" />
                    </div>
                    <div className="space-y-1 select-none">
                      <p className="font-bold text-stone-850 text-sm">Карточка не активна</p>
                      <p className="max-w-[210px] mx-auto text-[11px] text-stone-400 leading-relaxed">
                        Выберите заемщика из списка слева, чтобы посмотреть его график, ИНН / Паспорт и IMEI телефона.
                      </p>
                    </div>
                  </div>
                )}
              </div>

            </div>

          </div>
        )}
      </main>

      {/* Styled Footer */}
      <footer className="w-full text-center py-5 px-6 border-t border-stone-200/60 bg-white">
        <p className="text-[9px] text-stone-400 font-bold uppercase tracking-widest leading-none">
          Учет мобильных устройств • {new Date().getFullYear()}
        </p>
      </footer>

      {/* NEW CLIENT MODAL DRAWER - ON DEMAND */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl w-full max-w-md p-5 sm:p-7 space-y-4 shadow-2xl relative max-h-[92vh] overflow-y-auto"
            id="add_client_modal"
          >
            <div className="flex justify-between items-start border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-stone-900">Выдать девайс в рассрочку</h3>
                <p className="text-[11px] text-stone-400 leading-none mt-1">Создайте договор для заемщика</p>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-900 cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <form onSubmit={handleAddClientSubmit} className="space-y-3">
              
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-stone-500 mb-1">Имя</label>
                  <input
                    type="text"
                    required
                    placeholder="Адилет"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-xs hover:border-stone-300 focus:outline-none focus:border-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-stone-500 mb-1">Фамилия</label>
                  <input
                    type="text"
                    required
                    placeholder="Маматов"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-xs hover:border-stone-300 focus:outline-none focus:border-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-stone-500 mb-1">ИНН / Паспортные данные заемщика</label>
                <input
                  type="text"
                  required
                  placeholder="14-значный ПИН или номер ID паспорта"
                  value={newInn}
                  onChange={(e) => setNewInn(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-xs hover:border-stone-300 focus:outline-none focus:border-stone-900 font-mono"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-semibold text-stone-500">Номера телефонов заемщика</label>
                  <button
                    type="button"
                    onClick={handleAddPhoneField}
                    className="text-[10px] text-stone-900 hover:text-stone-700 font-bold flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Добавить еще
                  </button>
                </div>
                
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                  {newPhones.map((phoneVal, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          required={i === 0}
                          placeholder={i === 0 ? "Например, +996 555 123 456" : "Дополнительный телефон"}
                          value={phoneVal}
                          onChange={(e) => handlePhoneChange(i, e.target.value)}
                          className="w-full pl-8 pr-3 py-2 border border-stone-200 rounded-lg text-xs hover:border-stone-300 focus:outline-none focus:border-stone-900 font-mono"
                        />
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400">
                          <Phone className="w-3.5 h-3.5" />
                        </span>
                      </div>
                      
                      {newPhones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePhoneField(i)}
                          className="p-2 bg-stone-50 hover:bg-red-50 text-stone-450 hover:text-red-650 border border-stone-200 hover:border-red-150 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="Удалить номер"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-stone-500 mb-1 font-sans">Модель телефона</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="iPhone 15 Pro Max"
                      value={newPhoneModel}
                      onChange={(e) => setNewPhoneModel(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 border border-stone-200 rounded-lg text-xs hover:border-stone-300 focus:outline-none focus:border-stone-900 font-semibold text-stone-950"
                    />
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400">
                      <Smartphone className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-stone-500 mb-1 font-sans">IMEI телефона</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="15-значный IMEI девайса"
                      value={newImei}
                      onChange={(e) => setNewImei(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 border border-stone-200 rounded-lg text-xs hover:border-stone-300 focus:outline-none focus:border-stone-900 font-mono"
                    />
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-[10.5px] font-extrabold font-mono">
                      #
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-stone-500 mb-1">Стоимость телефона (сом)</label>
                  <input
                    type="number"
                    required
                    placeholder="85000"
                    value={newPhonePrice}
                    onChange={(e) => setNewPhonePrice(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-xs hover:border-stone-300 focus:outline-none focus:border-stone-900 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-stone-500 mb-1">Наценка (от 0% до 50%)</label>
                  <div className="flex items-center relative">
                    <input
                      type="number"
                      required
                      min="0"
                      max="50"
                      placeholder="15"
                      value={newMarkupPercent}
                      onChange={(e) => {
                        const val = Math.min(50, Math.max(0, parseInt(e.target.value) || 0));
                        setNewMarkupPercent(String(val));
                      }}
                      className="w-full px-3 pr-6 py-2 border border-stone-200 rounded-lg text-xs hover:border-stone-300 focus:outline-none focus:border-stone-900 font-semibold"
                    />
                    <span className="absolute right-2.5 text-stone-400 text-[10px] font-bold">%</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-stone-500 mb-1">Срок рассрочки (месяцев)</label>
                <div className="flex items-center gap-2">
                  <div className="relative w-24">
                    <input
                      type="number"
                      required
                      min="1"
                      max="60"
                      placeholder="6"
                      value={newDuration}
                      onChange={(e) => {
                        const val = Math.min(60, Math.max(1, parseInt(e.target.value) || 1));
                        setNewDuration(String(val));
                      }}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-xs hover:border-stone-300 focus:outline-none focus:border-stone-900 font-semibold"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-[10px] font-semibold">мес</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {['3', '6', '12', '18', '24'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setNewDuration(m)}
                        className={`text-[10px] px-2 py-1.5 border rounded-lg font-bold tracking-tight transition-all cursor-pointer ${
                          newDuration === m
                            ? 'bg-stone-900 text-stone-50 border-stone-900'
                            : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
                        }`}
                      >
                        {m} мес
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dynamic Markup preview feedback */}
              {newPhonePrice && (
                <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/50 text-[11px] leading-relaxed space-y-0.5 select-none font-medium text-stone-600">
                  <div className="flex justify-between">
                    <span>Базовая стоимость:</span>
                    <span className="font-mono text-stone-900">{parseFloat(newPhonePrice).toLocaleString() || 0} сом</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Наценка ({newMarkupPercent}%):</span>
                    <span className="font-mono text-stone-900">{( (parseFloat(newPhonePrice) || 0) * (parseFloat(newMarkupPercent) || 0) / 100 ).toLocaleString()} сом</span>
                  </div>
                  <div className="flex justify-between font-bold text-stone-900 border-t border-stone-200/80 pt-1 mt-1 text-xs">
                    <span>Итого по рассрочке ({newDuration} мес):</span>
                    <span className="font-mono">
                      {( (parseFloat(newPhonePrice) || 0) * (1 + (parseFloat(newMarkupPercent) || 0) / 100) ).toLocaleString()} сом
                    </span>
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1 italic text-center leading-xs">
                     Будет сформировано {newDuration} плановых платежей по {Math.round(( (parseFloat(newPhonePrice) || 0) * (1 + (parseFloat(newMarkupPercent) || 0) / 100) ) / (parseInt(newDuration) || 6)).toLocaleString()} сом.
                  </p>
                </div>
              )}

              {/* Customizable Payment Schedule List */}
              {customPayments.length > 0 && (
                <div className="space-y-1.5 border-t border-stone-100 pt-3">
                  <span className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                    График платежей (настройте даты здесь):
                  </span>
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {customPayments.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 bg-stone-50 p-1.5 rounded-lg border border-stone-200/60 shadow-xxs">
                        <span className="text-[9px] font-bold font-mono text-stone-400 w-5 text-center">
                          #{idx + 1}
                        </span>
                        
                        <div className="flex-1">
                          <input
                            type="date"
                            required
                            value={toInputDate(p.date)}
                            onChange={(e) => {
                              const standardDate = fromInputDate(e.target.value);
                              if (standardDate) {
                                handleCustomPaymentDateChange(idx, standardDate);
                              }
                            }}
                            className="w-full px-2 py-1 border border-stone-200 rounded-md text-xs font-semibold text-stone-850 bg-white focus:outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 font-mono"
                          />
                        </div>

                        <div className="text-right shrink-0 px-1">
                          <span className="text-xs font-bold font-mono text-stone-800">
                            {p.amount.toLocaleString()} сом
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-stone-900 hover:bg-stone-800 active:bg-stone-950 text-stone-50 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  Создать договор
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Отмена
                </button>
              </div>

            </form>
          </motion.div>
        </div>
      )}

      {/* Fade CSS styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.15s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
