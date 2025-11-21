/**
 * Home page - redirects to alerts
 */

import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/alerts');
}

