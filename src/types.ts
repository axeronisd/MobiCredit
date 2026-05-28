export interface Payment {
  id: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending';
}

export interface ClientInstallment {
  id: string;
  tenantId?: string; // ID арендатора (менеджера/магазина), которому принадлежит рассрочка
  firstName: string;
  lastName: string;
  inn: string; // ИНН (Паспортные данные)
  phoneModel: string;
  phone?: string; // Номер телефона заемщика
  imei: string; // IMEI телефона
  phonePrice: number;
  markupPercent: number; // e.g. 15 for 15%
  totalRemaining: number;
  payments: Payment[];
  createdAt?: string; // ISO timestamp
}

export interface UserAccount {
  id: string;
  login: string;
  passwordHash: string; // В нашей локальной системе сохраняем как открытый пароль или хэш, для простоты обычная строка
  role: 'admin' | 'manager';
  createdAt: string;
}

