// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://uemkfuedhbhhzowhpjgo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlbWtmdWVkaGJoaHpvd2hwamdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MTEwMzMsImV4cCI6MjA2NjE4NzAzM30.8x1JbbReKwnLBb0MuWnCaFGwEsWB0IPXMab0ehMf9ko";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);