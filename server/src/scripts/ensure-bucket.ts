import '../lib/env.js';
import { getSupabase } from '../lib/supabase.js';

async function main() {
  const supabase = getSupabase();

  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === 'research-papers');

  if (exists) {
    console.log('Bucket research-papers already exists');
    return;
  }

  const { error } = await supabase.storage.createBucket('research-papers', {
    public: false,
  });

  if (error) {
    throw new Error(`Failed to create bucket: ${error.message}`);
  }

  console.log('Created bucket: research-papers');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
