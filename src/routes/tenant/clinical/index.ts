import { Hono } from 'hono';
import type { Env, Variables } from '../../../types';
import { assessmentRoutes } from './assessments';
import { problemListRoutes } from './problem-list';
import { historyRoutes } from './history';
import { diagnosisRoutes } from './diagnosis';
import { dietRoutes } from './diet';
import { glucoseRoutes } from './glucose';

type ClinicalEnv = { Bindings: Env; Variables: Variables };

const clinicalRoutes = new Hono<ClinicalEnv>();

// Mount sub-routes
clinicalRoutes.route('/assessments', assessmentRoutes);
clinicalRoutes.route('/problems', problemListRoutes);
clinicalRoutes.route('/history', historyRoutes);
clinicalRoutes.route('/diagnosis', diagnosisRoutes);
clinicalRoutes.route('/diet', dietRoutes);
clinicalRoutes.route('/glucose', glucoseRoutes);

export default clinicalRoutes;
