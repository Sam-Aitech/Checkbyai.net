import 'dotenv/config';
import { runSponsorMonitorJob } from './server/utils/sponsorMonitorJob';

async function main() {
  console.log('Starting ETL job...');
  try {
    const result = await runSponsorMonitorJob('manual', true);
    console.log('ETL Job completed successfully:', result);
    process.exit(0);
  } catch (error) {
    console.error('ETL Job failed:', error);
    process.exit(1);
  }
}

main();
