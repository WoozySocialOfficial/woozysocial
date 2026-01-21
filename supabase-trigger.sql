-- Drop existing policies that might be blocking
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON user_profiles;

-- Create a function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Only insert if profile doesn't already exist
  -- This allows marketing site to pre-create profiles before auth user creation
  INSERT INTO public.user_profiles (
    id,
    email,
    full_name,
    onboarding_completed,
    subscription_status,
    subscription_tier
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    false,
    'inactive',
    'free'
  )
  ON CONFLICT (id) DO NOTHING;  -- Skip if already exists
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to run the function when a new user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update RLS policies for user_profiles
-- Users can only view their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Allow the trigger to insert (using SECURITY DEFINER)
-- No INSERT policy needed since trigger handles it
