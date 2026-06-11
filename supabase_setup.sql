-- ═══ 3D Makers Finance — Supabase Database Setup Script ═══
-- Run this script in the Supabase SQL Editor to set up all tables, security policies, and sample data.

-- 1. CLEANUP (WARNING: This will drop existing tables to recreate them)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.advertising CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.sales CASCADE;
DROP TABLE IF EXISTS public.purchases CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.capital CASCADE;
DROP TABLE IF EXISTS public.assumptions CASCADE;
DROP TABLE IF EXISTS public.users_profile CASCADE;

-- 2. CREATE TABLES
-- User Profiles (Linked to Supabase Auth.users)
CREATE TABLE public.users_profile (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'sales_only')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Financial Assumptions / Settings
CREATE TABLE public.assumptions (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  filament_cost_per_gram NUMERIC(10,4) NOT NULL DEFAULT 0.015,
  printer_cost_per_hour NUMERIC(10,4) NOT NULL DEFAULT 0.30
);

-- Capital Investment
CREATE TABLE public.capital (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Product Calculator Data
CREATE TABLE public.products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  filament_weight NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  print_time NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  extra_materials NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  desired_margin NUMERIC(5,3) NOT NULL DEFAULT 0.500,
  actual_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Purchases
CREATE TABLE public.purchases (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  material TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  supplier TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sales (Nabil has INSERT-ONLY, Mohammed has ALL)
CREATE TABLE public.sales (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  product TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  channel TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- General Expenses
CREATE TABLE public.expenses (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Advertising Campaigns
CREATE TABLE public.advertising (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  platform TEXT NOT NULL,
  campaign_type TEXT NOT NULL,
  budget NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  actual_spend NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  sales_count INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertising ENABLE ROW LEVEL SECURITY;

-- 4. CREATE RLS POLICIES

-- Helper Policies: Authenticated users can read anything (SELECT)
CREATE POLICY "allow_read_users_profile" ON public.users_profile FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "allow_read_assumptions" ON public.assumptions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "allow_read_capital" ON public.capital FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "allow_read_products" ON public.products FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "allow_read_purchases" ON public.purchases FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "allow_read_sales" ON public.sales FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "allow_read_expenses" ON public.expenses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "allow_read_advertising" ON public.advertising FOR SELECT USING (auth.role() = 'authenticated');

-- Admin Profile Helper Functions
-- We check if the current user has 'admin' role in public.users_profile
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin Write Policies (Mohammed has full access to everything)
CREATE POLICY "admin_all_users_profile" ON public.users_profile FOR ALL USING (public.is_admin());
CREATE POLICY "admin_all_assumptions" ON public.assumptions FOR ALL USING (public.is_admin());
CREATE POLICY "admin_all_capital" ON public.capital FOR ALL USING (public.is_admin());
CREATE POLICY "admin_all_products" ON public.products FOR ALL USING (public.is_admin());
CREATE POLICY "admin_all_purchases" ON public.purchases FOR ALL USING (public.is_admin());
CREATE POLICY "admin_all_sales" ON public.sales FOR ALL USING (public.is_admin());
CREATE POLICY "admin_all_expenses" ON public.expenses FOR ALL USING (public.is_admin());
CREATE POLICY "admin_all_advertising" ON public.advertising FOR ALL USING (public.is_admin());

-- Sales Policies (Nabil and other authenticated users can INSERT sales but NOT update or delete them)
CREATE POLICY "authenticated_insert_sales" ON public.sales
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
  );

-- 5. TRIGGER ON USER SIGNUP (Auto-create profile)
-- Automatically inserts a row in public.users_profile when a new user signs up or is created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users_profile (id, name, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'شريك جديد'),
    COALESCE(new.raw_user_meta_data->>'role', 'sales_only')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. INSERT SEED / DEFAULT DATA
-- Insert initial financial assumptions
INSERT INTO public.assumptions (id, filament_cost_per_gram, printer_cost_per_hour)
VALUES (1, 0.015, 0.30)
ON CONFLICT (id) DO NOTHING;

-- Capital Seed Data
INSERT INTO public.capital (date, type, description, amount, notes) VALUES
('2025-01-15', 'طابعة ثلاثية الأبعاد', 'Creality Ender 3 V3 SE', 250.00, 'الدفعة الأولى — ثمن الطابعة كاملاً'),
('2025-02-01', 'موقع إلكتروني / منصة', 'بناء واستضافة المتجر الإلكتروني', 150.00, 'تصميم + استضافة سنة'),
('2025-02-10', 'معدات وأدوات', 'أدوات تشطيب + مواد تغليف', 35.00, 'مقص حراري + ورق صنفرة + أكياس');

-- Products Seed Data
INSERT INTO public.products (name, filament_weight, print_time, extra_materials, desired_margin, actual_price) VALUES
('علاقة مفاتيح — Keychain', 25.00, 1.5, 0.20, 0.500, 2.50),
('مجسم ديكور صغير — Figurine', 80.00, 4.0, 0.50, 0.600, 8.00),
('حامل موبايل — Phone Stand', 120.00, 5.0, 0.50, 0.400, 10.00);

-- Purchases Seed Data
INSERT INTO public.purchases (date, material, quantity, total_price, supplier, notes) VALUES
('2025-02-15', 'فيلمنت PLA — أبيض', 1000.00, 15.00, 'Amazon', 'أول كمية — 1 كيلو'),
('2025-03-01', 'فيلمنت PLA — أسود', 1000.00, 15.00, 'Amazon', 'كيلو ثاني');

-- Sales Seed Data
INSERT INTO public.sales (date, product, quantity, unit_price, channel, notes) VALUES
('2025-03-05', 'علاقة مفاتيح — Keychain', 3, 2.50, 'واتساب', 'أول طلبية!'),
('2025-03-10', 'حامل موبايل — Phone Stand', 1, 10.00, 'يد بيد', 'بيع مباشر لصديق');

-- Expenses Seed Data
INSERT INTO public.expenses (date, category, description, amount, notes) VALUES
('2025-03-01', 'اشتراكات وخدمات رقمية', 'اشتراك Canva Pro شهري', 12.99, 'لتصميم منشورات السوشال ميديا'),
('2025-03-15', 'نقل وتوصيل', 'توصيل طلبية للعميل', 5.00, '');

-- Advertising Seed Data
INSERT INTO public.advertising (date, platform, campaign_type, budget, actual_spend, sales_count, revenue, notes) VALUES
('2025-04-01', 'Instagram', 'ترويج منشور — Boost Post', 20.00, 18.50, 4, 35.00, 'أول حملة تجريبية');
