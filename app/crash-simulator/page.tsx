import { redirect } from 'next/navigation';

/**
 * The replay Simulator was retired (Nov 2026): its historical engine now
 * feeds Put Hunter and Put Setups directly. Old links land on Put Hunter.
 */
export default function CrashSimulatorPage() {
  redirect('/put-hunter');
}
