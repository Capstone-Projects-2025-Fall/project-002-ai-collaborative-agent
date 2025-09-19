import { supabase } from '../lib/supabaseClient.js'

async function run() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .limit(5)

  console.log({ data, error })
}

run()
