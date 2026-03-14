/** @jsxImportSource hono/jsx */
import type { FC } from 'hono/jsx';

interface HeroSectionProps {
  hospitalName: string;
  tagline?: string;
  heroImageUrl?: string;
  basePath: string;
  portalUrl?: string;
}

export const HeroSection: FC<HeroSectionProps> = ({ hospitalName, tagline, heroImageUrl, basePath, portalUrl }) => {
  const portal = portalUrl || 'https://hms.ozzyl.com';
  return (
  <section class="hero">
    <div class="container">
      <h1>{hospitalName}</h1>
      <p>{tagline || 'আপনার স্বাস্থ্যসেবার বিশ্বস্ত সঙ্গী — আধুনিক প্রযুক্তি, যত্নশীল সেবা'}</p>
      <div class="hero-cta">
        <a href={`${portal}/patient/login?redirect=/appointments/new`} class="btn btn-primary">
          📅 Book Appointment
        </a>
        <a href={`${portal}/patient/login`} class="btn btn-outline">
          🔐 Patient Portal
        </a>
        <a href={`${basePath}/doctors`} class="btn btn-outline">
          👨‍⚕️ Our Doctors
        </a>
      </div>
    </div>
  </section>
);
};
