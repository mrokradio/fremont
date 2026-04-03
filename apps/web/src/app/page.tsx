import dynamic from 'next/dynamic';

const FremontClient = dynamic(() => import('./FremontClient'), { ssr: false });

export default function HomePage() {
  return <FremontClient />;
}
