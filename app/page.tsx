import { Nav, Hero } from "./_components/Hero";
import { Sections } from "./_components/Cockpit";

export default function Home() {
  return (
    <main className="grain relative min-h-screen bg-bg">
      <Nav />
      <Hero />
      <Sections />
    </main>
  );
}
