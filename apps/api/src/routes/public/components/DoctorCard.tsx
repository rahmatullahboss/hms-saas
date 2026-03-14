/** @jsxImportSource hono/jsx */
import type { FC } from 'hono/jsx';

interface Doctor {
  id: number;
  name: string;
  specialty?: string;
  consultation_fee?: number;
  photo_key?: string;
  public_bio?: string;
  qualifications?: string;
  visiting_hours?: string;
}

interface DoctorCardProps {
  doctor: Doctor;
  basePath: string;
  uploadsBaseUrl?: string;
}

export const DoctorCard: FC<DoctorCardProps> = ({ doctor, basePath, uploadsBaseUrl }) => {
  const photoUrl = doctor.photo_key && uploadsBaseUrl
    ? `${uploadsBaseUrl}/${doctor.photo_key}`
    : null;

  return (
    <div class="card doctor-card">
      <div style="height:200px;background:#f0f4f8;display:flex;align-items:center;justify-content:center;overflow:hidden">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={doctor.name}
            loading="lazy"
            style="width:100%;height:100%;object-fit:cover"
          />
        ) : (
          <span style="font-size:4rem;opacity:0.3">👨‍⚕️</span>
        )}
      </div>
      <div class="card-body">
        <h3 style="font-size:1.1rem;font-weight:600;margin-bottom:0.25rem">{doctor.name}</h3>
        {doctor.specialty && (
          <p class="doctor-specialty" style="font-size:0.9rem;margin-bottom:0.5rem">
            {doctor.specialty}
          </p>
        )}
        {doctor.qualifications && (
          <p style="font-size:0.8rem;opacity:0.6;margin-bottom:0.5rem">{doctor.qualifications}</p>
        )}
        {doctor.visiting_hours && (
          <p style="font-size:0.85rem;opacity:0.7">
            🕐 {doctor.visiting_hours}
          </p>
        )}
        {doctor.consultation_fee != null && (
          <p class="doctor-fee" style="font-size:1rem;margin-top:0.5rem">
            ৳{doctor.consultation_fee}
          </p>
        )}
      </div>
    </div>
  );
};

interface DoctorListProps {
  doctors: Doctor[];
  basePath: string;
  uploadsBaseUrl?: string;
}

export const DoctorList: FC<DoctorListProps> = ({ doctors, basePath, uploadsBaseUrl }) => (
  <div class="grid grid-3">
    {doctors.map((doc) => (
      <DoctorCard doctor={doc} basePath={basePath} uploadsBaseUrl={uploadsBaseUrl} />
    ))}
  </div>
);
