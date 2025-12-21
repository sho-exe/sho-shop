import { createClient } from '@supabase/supabase-js';

// REPLACE THESE WITH YOUR ACTUAL SUPABASE KEYS
const supabaseUrl = 'https://fzeazlvrivcacxqqcdtj.supabase.co';
const supabaseKey = 'sb_publishable_7K4uPfuiSwYID531gB7j5Q_6BxKYhAc';

export const supabase = createClient(supabaseUrl, supabaseKey);


// pass : 1UiZNKycmJhSA2Zw