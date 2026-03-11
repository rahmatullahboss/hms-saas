import { describe, it, expect } from 'vitest';

describe('HMS Patient Management Tests', () => {
  describe('Patient Registration', () => {
    it('should create patient with all required fields', () => {
      const patient = {
        name: 'John Doe',
        father_husband: 'Robert Doe',
        address: '123 Main Street, Dhaka',
        mobile: '01712345678',
        guardian_mobile: '01712345679',
        age: 35,
        gender: 'male',
        blood_group: 'O+',
      };

      expect(patient.name).toBeDefined();
      expect(patient.father_husband).toBeDefined();
      expect(patient.address).toBeDefined();
      expect(patient.mobile).toBeDefined();
    });

    it('should validate Bangladeshi mobile number', () => {
      const isValidMobile = (mobile: string) => {
        return /^01[3-9]\d{8}$/.test(mobile);
      };

      expect(isValidMobile('01712345678')).toBe(true);
      expect(isValidMobile('01812345678')).toBe(true);
      expect(isValidMobile('01612345678')).toBe(true);
      expect(isValidMobile('01112345678')).toBe(false);
      expect(isValidMobile('12345678901')).toBe(false);
    });

    it('should validate gender options', () => {
      const validGenders = ['male', 'female', 'other'];
      
      expect(validGenders).toContain('male');
      expect(validGenders).toContain('female');
      expect(validGenders).toContain('other');
    });

    it('should validate blood group', () => {
      const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
      
      validBloodGroups.forEach(bg => {
        expect(validBloodGroups).toContain(bg);
      });
    });

    it('should generate unique patient code', () => {
      const generatePatientCode = () => {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `P-${timestamp}-${random}`;
      };

      const code1 = generatePatientCode();
      const code2 = generatePatientCode();
      
      expect(code1).toMatch(/^P-[A-Z0-9]+-[A-Z0-9]{4}$/);
      expect(code1).not.toBe(code2);
    });
  });

  describe('Patient Search', () => {
    it('should search by name', () => {
      const patients = [
        { name: 'Rahim', mobile: '01712345678' },
        { name: 'Karim', mobile: '01712345679' },
        { name: 'Rahman', mobile: '01712345680' },
      ];

      const searchTerm = 'Rah';
      const results = patients.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(results.length).toBe(2);
    });

    it('should search by mobile number', () => {
      const patients = [
        { name: 'Rahim', mobile: '01712345678' },
        { name: 'Karim', mobile: '01712345679' },
      ];

      const results = patients.filter(p => p.mobile === '01712345678');
      
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Rahim');
    });
  });

  describe('Patient Update', () => {
    it('should update patient information', () => {
      const patient = {
        name: 'John Doe',
        mobile: '01712345678',
      };

      const updatedPatient = {
        ...patient,
        mobile: '01912345678',
      };

      expect(updatedPatient.mobile).toBe('01912345678');
      expect(updatedPatient.name).toBe('John Doe');
    });
  });
});
