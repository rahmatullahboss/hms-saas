import { Hono } from 'hono';
import type { Env, Variables } from '../../../types';
import leaveRoutes from './leave';
import attendanceRoutes from './attendance';
import payrollRoutes from './payroll';

const hrRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Mount sub-routes
hrRoutes.route('/leave', leaveRoutes);
hrRoutes.route('/attendance', attendanceRoutes);
hrRoutes.route('/payroll', payrollRoutes);

export default hrRoutes;
