/** @jsxImportSource hono/jsx */
import type { FC } from 'hono/jsx';

interface FooterProps {
  hospitalName: string;
  address?: string;
  phone?: string;
  email?: string;
  whatsappNumber?: string;
  facebookUrl?: string;
  basePath: string;
  subdomain?: string;
}

export const Footer: FC<FooterProps> = (props) => (
  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <h3>🏥 {props.hospitalName}</h3>
          {props.address && <p>{props.address}</p>}
          {props.phone && <p>📞 {props.phone}</p>}
          {props.email && <p>✉️ {props.email}</p>}
        </div>
        <div class="footer-links">
          <h4>Quick Links</h4>
          <a href={`${props.basePath}/doctors`}>Our Doctors</a>
          <a href={`${props.basePath}/services`}>Services</a>
          <a href={`${props.basePath}/about`}>About Us</a>
          <a href={`${props.basePath}/contact`}>Contact</a>
        </div>
        <div class="footer-links">
          <h4>Patient</h4>
          <a href="/patient/login">Patient Portal</a>
          {props.whatsappNumber && (
            <a href={`https://wa.me/${props.whatsappNumber.replace(/\D/g, '')}`}
               target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          )}
          {props.facebookUrl && (
            <a href={props.facebookUrl} target="_blank" rel="noopener noreferrer">
              Facebook
            </a>
          )}
        </div>
      </div>
      <div class="footer-bottom">
        <p>© {new Date().getFullYear()} {props.hospitalName}. Powered by{' '}
          <a href={`https://hms.ozzyl.com?ref=${props.subdomain || 'hospital-site'}`} target="_blank" rel="noopener noreferrer"
            style="opacity:0.6;text-decoration:underline">HMS SaaS</a>.</p>
      </div>
    </div>
  </footer>
);
