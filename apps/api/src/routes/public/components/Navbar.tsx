/** @jsxImportSource hono/jsx */
import type { FC } from 'hono/jsx';

interface NavbarProps {
  hospitalName: string;
  logoUrl?: string;
  basePath: string; // e.g. "/site"
}

export const Navbar: FC<NavbarProps> = ({ hospitalName, logoUrl, basePath }) => (
  <nav class="navbar">
    <div class="container">
      <a href={basePath} class="nav-brand">
        {logoUrl ? (
          <img src={logoUrl} alt={hospitalName} width="36" height="36" />
        ) : (
          <span style="font-size:1.5rem">🏥</span>
        )}
        <span>{hospitalName}</span>
      </a>
      <div class="nav-links">
        <a href={`${basePath}/doctors`}>Doctors</a>
        <a href={`${basePath}/services`}>Services</a>
        <a href={`${basePath}/about`}>About</a>
        <a href={`${basePath}/contact`}>Contact</a>
        <a href="/patient/login" class="btn btn-primary" style="padding:0.5rem 1.25rem;font-size:0.9rem">
          Patient Portal →
        </a>
      </div>
      <button class="nav-mobile-toggle" aria-label="Menu">☰</button>
    </div>
  </nav>
);
