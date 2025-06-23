import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bbwrdyninlqhrqbaivpq.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJid3JkeW5pbmxxaHJxYmFpdnBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2NzAyOTMsImV4cCI6MjA2NjI0NjI5M30.z9h9KqIj33KUivgFCWzsjyDEyLrIPLixWDjIPed3bKY';

export const supabase = createClient(supabaseUrl, supabaseKey); 