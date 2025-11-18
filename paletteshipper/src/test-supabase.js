// Simple test script to check Supabase connection
// Run with: node src/test-supabase.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_URL_HERE';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_KEY_HERE';

console.log('Testing Supabase connection...');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseAnonKey.substring(0, 20) + '...');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  try {
    // Test basic connection
    const { data, error } = await supabase
      .from('quotes')
      .select('count()')
      .single();
    
    console.log('Quotes count result:', { data, error });
    
    // Test simple select
    const { data: quotes, error: quotesError } = await supabase
      .from('quotes')
      .select('id, title')
      .limit(3);
    
    console.log('Simple quotes select:', { quotes, quotesError });
    
  } catch (err) {
    console.error('Connection test failed:', err);
  }
}

testConnection(); 