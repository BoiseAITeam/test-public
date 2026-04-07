'use strict';

const express  = require('express');
const { Pool } = require('pg');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'insuretrack-dev-secret-change-in-production';

// ==================== MIDDLEWARE ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ==================== DATABASE ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,               // keep connection count low for serverless
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Quick helper: run a parameterised query and return all rows
const query = (sql, params) => pool.query(sql, params).then(r => r.rows);
// Quick helper: return the first row only
const queryOne = (sql, params) => pool.query(sql, params).then(r => r.rows[0] || null);

// ==================== HELPERS ====================
function getDaysUntilExpiration(dateVal) {
  if (!dateVal) return null;
  const exp = new Date(dateVal);
  const now = new Date();
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
}

async function computeSubStatus(sub_id) {
  const sub = await queryOne('SELECT w9_on_file FROM subcontractors WHERE id=$1', [sub_id]);
  if (!sub) return 'pending';
  if (!sub.w9_on_file) return 'pending';

  const policies = await query('SELECT status, expiration_date FROM insurance_policies WHERE sub_id=$1', [sub_id]);
  if (policies.length === 0) return 'non_compliant';
  if (policies.some(p => p.status === 'expired')) return 'non_compliant';

  const expiringSoon = policies.some(p => {
    const days = getDaysUntilExpiration(p.expiration_date);
    return days !== null && days <= 30 && days >= 0;
  });
  return expiringSoon ? 'expiring_soon' : 'active';
}

async function sendMockEmail(to_email, to_name, template_type, subject, body, sent_by, sub_id, policy_id) {
  const row = await queryOne(
    `INSERT INTO email_log (to_email,to_name,recipient_type,template_type,subject,body,status,sent_by,sub_id,policy_id)
     VALUES ($1,$2,'agent',$3,$4,$5,'sent',$6,$7,$8) RETURNING id`,
    [to_email, to_name||null, template_type||null, subject, body, sent_by, sub_id||null, policy_id||null]
  );
  return row.id;
}

// ==================== AUTH MIDDLEWARE ====================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function adminOrGC(req, res, next) {
  if (!['admin','general_contractor'].includes(req.user.role))
    return res.status(403).json({ error: 'Insufficient permissions' });
  next();
}

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await queryOne(
      'SELECT * FROM users WHERE email=$1 AND is_active=TRUE', [email.toLowerCase().trim()]
    );
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET, { expiresIn: '24h' }
    );

    let gcId = null;
    if (user.role === 'general_contractor') {
      const gc = await queryOne('SELECT id FROM general_contractors WHERE user_id=$1', [user.id]);
      gcId = gc ? gc.id : null;
    }

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, company: user.company, gcId } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await queryOne(
      'SELECT id,email,name,role,phone,company,is_active,created_at FROM users WHERE id=$1', [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    let gcId = null;
    if (user.role === 'general_contractor') {
      const gc = await queryOne('SELECT id FROM general_contractors WHERE user_id=$1', [user.id]);
      gcId = gc ? gc.id : null;
    }
    res.json({ ...user, gcId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== USER ROUTES ====================
app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await query('SELECT id,email,name,role,phone,company,is_active,created_at FROM users ORDER BY name');
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { email, password, name, role, phone, company } = req.body;
    if (!email || !password || !name || !role) return res.status(400).json({ error: 'Email, password, name, and role are required' });
    const hash = bcrypt.hashSync(password, 10);
    const row = await queryOne(
      'INSERT INTO users (email,password,name,role,phone,company) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [email.toLowerCase().trim(), hash, name, role, phone||null, company||null]
    );
    res.status(201).json({ id: row.id, message: 'User created successfully' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, email, phone, company, role, is_active } = req.body;
    await query(
      'UPDATE users SET name=$1,email=$2,phone=$3,company=$4,role=$5,is_active=$6 WHERE id=$7',
      [name, email, phone, company, role, is_active, req.params.id]
    );
    res.json({ message: 'User updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== GENERAL CONTRACTOR ROUTES ====================
app.get('/api/general-contractors', authMiddleware, async (req, res) => {
  try {
    let gcs;
    if (req.user.role === 'general_contractor') {
      gcs = await query('SELECT * FROM general_contractors WHERE user_id=$1', [req.user.id]);
    } else {
      gcs = await query('SELECT * FROM general_contractors ORDER BY company_name');
    }
    res.json(gcs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/general-contractors', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { company_name, contact_name, email, phone, address, city, state, zip, license_number, notes, require_additional_insured } = req.body;
    if (!company_name) return res.status(400).json({ error: 'Company name required' });
    const row = await queryOne(
      `INSERT INTO general_contractors (company_name,contact_name,email,phone,address,city,state,zip,license_number,notes,require_additional_insured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [company_name, contact_name, email, phone, address, city||'Boise', state||'ID', zip, license_number, notes, !!require_additional_insured]
    );
    res.status(201).json({ id: row.id, message: 'General contractor created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/general-contractors/:id', authMiddleware, async (req, res) => {
  try {
    const gc = await queryOne('SELECT * FROM general_contractors WHERE id=$1', [req.params.id]);
    if (!gc) return res.status(404).json({ error: 'Not found' });
    const subs = await query(
      `SELECT s.*, gcs.added_date FROM subcontractors s
       JOIN gc_subcontractor gcs ON gcs.sub_id=s.id
       WHERE gcs.gc_id=$1 AND gcs.is_active=TRUE ORDER BY s.company_name`, [req.params.id]
    );
    res.json({ ...gc, subcontractors: subs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/general-contractors/:id', authMiddleware, adminOrGC, async (req, res) => {
  try {
    const { company_name, contact_name, email, phone, address, city, state, zip, license_number, notes, require_additional_insured } = req.body;
    await query(
      `UPDATE general_contractors SET company_name=$1,contact_name=$2,email=$3,phone=$4,address=$5,
       city=$6,state=$7,zip=$8,license_number=$9,notes=$10,require_additional_insured=$11 WHERE id=$12`,
      [company_name, contact_name, email, phone, address, city, state, zip, license_number, notes, !!require_additional_insured, req.params.id]
    );
    res.json({ message: 'General contractor updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== SUBCONTRACTOR ROUTES ====================
app.get('/api/subcontractors', authMiddleware, async (req, res) => {
  try {
    let subs;
    if (req.user.role === 'general_contractor') {
      const gc = await queryOne('SELECT id FROM general_contractors WHERE user_id=$1', [req.user.id]);
      if (!gc) return res.json([]);
      subs = await query(
        `SELECT s.* FROM subcontractors s JOIN gc_subcontractor gcs ON gcs.sub_id=s.id
         WHERE gcs.gc_id=$1 AND gcs.is_active=TRUE ORDER BY s.company_name`, [gc.id]
      );
    } else {
      subs = await query('SELECT * FROM subcontractors ORDER BY company_name');
    }

    const enriched = await Promise.all(subs.map(async s => {
      const policies = await query('SELECT * FROM insurance_policies WHERE sub_id=$1', [s.id]);
      const glPolicy = policies.find(p => p.policy_type === 'general_liability') || null;
      const wcPolicy = policies.find(p => p.policy_type === 'workers_comp') || null;
      return {
        ...s,
        computed_status: await computeSubStatus(s.id),
        gl_policy: glPolicy,
        wc_policy: wcPolicy,
        gl_days_remaining: glPolicy ? getDaysUntilExpiration(glPolicy.expiration_date) : null,
        wc_days_remaining: wcPolicy ? getDaysUntilExpiration(wcPolicy.expiration_date) : null,
        policy_count: policies.length,
      };
    }));

    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/subcontractors', authMiddleware, adminOrGC, async (req, res) => {
  try {
    const { company_name, contact_name, email, phone, address, city, state, zip, trade,
      is_sole_proprietor, w9_tax_id, w9_entity_type, w9_signature_date, w9_on_file,
      w9_year, notes, gc_id } = req.body;

    if (!company_name || !contact_name || !email)
      return res.status(400).json({ error: 'Company name, contact name, and email are required' });

    const row = await queryOne(
      `INSERT INTO subcontractors
         (company_name,contact_name,email,phone,address,city,state,zip,trade,
          is_sole_proprietor,w9_tax_id,w9_entity_type,w9_signature_date,w9_on_file,w9_year,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [company_name, contact_name, email, phone||null, address||null, city||'Boise', state||'ID',
       zip||null, trade||null, !!is_sole_proprietor, w9_tax_id||null, w9_entity_type||null,
       w9_signature_date||null, !!w9_on_file, w9_year||null, notes||null]
    );

    if (gc_id) {
      await query(
        'INSERT INTO gc_subcontractor (gc_id,sub_id,added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [gc_id, row.id, req.user.id]
      );
    }

    res.status(201).json({ id: row.id, message: 'Subcontractor created successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/subcontractors/:id', authMiddleware, async (req, res) => {
  try {
    const sub = await queryOne('SELECT * FROM subcontractors WHERE id=$1', [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Subcontractor not found' });

    const policies = await query(
      `SELECT p.*, a.name as agent_name, a.email as agent_email, a.phone as agent_phone, a.agency_name
       FROM insurance_policies p LEFT JOIN insurance_agents a ON a.id=p.agent_id
       WHERE p.sub_id=$1 ORDER BY p.policy_type`, [req.params.id]
    );
    const gcs = await query(
      `SELECT gc.*, u.email as user_email FROM general_contractors gc
       JOIN gc_subcontractor gcs ON gcs.gc_id=gc.id
       LEFT JOIN users u ON u.id=gc.user_id
       WHERE gcs.sub_id=$1 AND gcs.is_active=TRUE`, [req.params.id]
    );

    res.json({
      ...sub,
      policies: policies.map(p => ({ ...p, days_remaining: getDaysUntilExpiration(p.expiration_date) })),
      general_contractors: gcs,
      computed_status: await computeSubStatus(sub.id),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/subcontractors/:id', authMiddleware, async (req, res) => {
  try {
    const { company_name, contact_name, email, phone, address, city, state, zip, trade,
      is_sole_proprietor, w9_tax_id, w9_entity_type, w9_signature_date, w9_on_file, w9_year, notes } = req.body;

    await query(
      `UPDATE subcontractors SET company_name=$1,contact_name=$2,email=$3,phone=$4,address=$5,
       city=$6,state=$7,zip=$8,trade=$9,is_sole_proprietor=$10,w9_tax_id=$11,w9_entity_type=$12,
       w9_signature_date=$13,w9_on_file=$14,w9_year=$15,notes=$16,updated_at=NOW() WHERE id=$17`,
      [company_name, contact_name, email, phone, address, city, state, zip,
       trade, !!is_sole_proprietor, w9_tax_id, w9_entity_type, w9_signature_date||null,
       !!w9_on_file, w9_year||null, notes, req.params.id]
    );
    res.json({ message: 'Subcontractor updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== GC-SUB RELATIONSHIP ROUTES ====================
app.post('/api/gc-subcontractors', authMiddleware, adminOrGC, async (req, res) => {
  try {
    const { gc_id, sub_id } = req.body;
    if (!gc_id || !sub_id) return res.status(400).json({ error: 'gc_id and sub_id required' });
    await query(
      'INSERT INTO gc_subcontractor (gc_id,sub_id,added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [gc_id, sub_id, req.user.id]
    );
    await query('UPDATE gc_subcontractor SET is_active=TRUE WHERE gc_id=$1 AND sub_id=$2', [gc_id, sub_id]);
    res.status(201).json({ message: 'Subcontractor linked to general contractor' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/gc-subcontractors/:gcId/:subId', authMiddleware, adminOnly, async (req, res) => {
  try {
    await query('UPDATE gc_subcontractor SET is_active=FALSE WHERE gc_id=$1 AND sub_id=$2', [req.params.gcId, req.params.subId]);
    res.json({ message: 'Subcontractor unlinked' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== INSURANCE AGENT ROUTES ====================
app.get('/api/insurance-agents', authMiddleware, async (req, res) => {
  try {
    res.json(await query('SELECT * FROM insurance_agents ORDER BY name'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/insurance-agents', authMiddleware, adminOrGC, async (req, res) => {
  try {
    const { name, email, phone, agency_name } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
    const row = await queryOne(
      'INSERT INTO insurance_agents (name,email,phone,agency_name) VALUES ($1,$2,$3,$4) RETURNING id',
      [name, email, phone||null, agency_name||null]
    );
    res.status(201).json({ id: row.id, message: 'Insurance agent created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/insurance-agents/:id', authMiddleware, adminOrGC, async (req, res) => {
  try {
    const { name, email, phone, agency_name } = req.body;
    await query('UPDATE insurance_agents SET name=$1,email=$2,phone=$3,agency_name=$4 WHERE id=$5',
      [name, email, phone, agency_name, req.params.id]);
    res.json({ message: 'Agent updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== INSURANCE POLICY ROUTES ====================
app.get('/api/policies', authMiddleware, async (req, res) => {
  try {
    const { sub_id } = req.query;
    let rows;
    if (sub_id) {
      rows = await query(
        `SELECT p.*, a.name as agent_name, a.email as agent_email, a.phone as agent_phone, a.agency_name,
         s.company_name as sub_name FROM insurance_policies p
         LEFT JOIN insurance_agents a ON a.id=p.agent_id
         LEFT JOIN subcontractors s ON s.id=p.sub_id
         WHERE p.sub_id=$1 ORDER BY p.policy_type`, [sub_id]
      );
    } else {
      rows = await query(
        `SELECT p.*, a.name as agent_name, a.email as agent_email, a.agency_name,
         s.company_name as sub_name FROM insurance_policies p
         LEFT JOIN insurance_agents a ON a.id=p.agent_id
         LEFT JOIN subcontractors s ON s.id=p.sub_id
         ORDER BY p.expiration_date`
      );
    }
    res.json(rows.map(p => ({ ...p, days_remaining: getDaysUntilExpiration(p.expiration_date) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/policies/expiring', authMiddleware, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const rows = await query(
      `SELECT p.*, a.name as agent_name, a.email as agent_email, a.agency_name,
       s.company_name as sub_name FROM insurance_policies p
       LEFT JOIN insurance_agents a ON a.id=p.agent_id
       LEFT JOIN subcontractors s ON s.id=p.sub_id
       WHERE p.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1 * INTERVAL '1 day'
         AND p.status != 'expired'
       ORDER BY p.expiration_date`, [days]
    );
    res.json(rows.map(p => ({ ...p, days_remaining: getDaysUntilExpiration(p.expiration_date) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/policies', authMiddleware, async (req, res) => {
  try {
    const { sub_id, agent_id, policy_type, policy_number, carrier, coverage_amount,
      effective_date, expiration_date, status, requires_additional_insured,
      additional_insured_confirmed, is_ghost_policy, certificate_on_file, notes } = req.body;

    if (!sub_id || !policy_type) return res.status(400).json({ error: 'sub_id and policy_type required' });

    const row = await queryOne(
      `INSERT INTO insurance_policies
         (sub_id,agent_id,policy_type,policy_number,carrier,coverage_amount,effective_date,expiration_date,
          status,requires_additional_insured,additional_insured_confirmed,is_ghost_policy,certificate_on_file,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [sub_id, agent_id||null, policy_type, policy_number||null, carrier||null, coverage_amount||null,
       effective_date||null, expiration_date||null, status||'active',
       !!requires_additional_insured, !!additional_insured_confirmed,
       !!is_ghost_policy, !!certificate_on_file, notes||null]
    );
    res.status(201).json({ id: row.id, message: 'Policy created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/policies/:id', authMiddleware, async (req, res) => {
  try {
    const { agent_id, policy_type, policy_number, carrier, coverage_amount, effective_date,
      expiration_date, status, requires_additional_insured, additional_insured_confirmed,
      is_ghost_policy, certificate_on_file, notes } = req.body;

    await query(
      `UPDATE insurance_policies SET agent_id=$1,policy_type=$2,policy_number=$3,carrier=$4,
       coverage_amount=$5,effective_date=$6,expiration_date=$7,status=$8,
       requires_additional_insured=$9,additional_insured_confirmed=$10,
       is_ghost_policy=$11,certificate_on_file=$12,notes=$13,updated_at=NOW() WHERE id=$14`,
      [agent_id, policy_type, policy_number, carrier, coverage_amount, effective_date, expiration_date, status,
       !!requires_additional_insured, !!additional_insured_confirmed,
       !!is_ghost_policy, !!certificate_on_file, notes, req.params.id]
    );
    res.json({ message: 'Policy updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/policies/:id/verify', authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    await query('UPDATE insurance_policies SET last_verified_date=$1,updated_at=NOW() WHERE id=$2', [today, req.params.id]);
    res.json({ message: 'Policy verified', verified_date: today });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/policies/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await query('DELETE FROM insurance_policies WHERE id=$1', [req.params.id]);
    res.json({ message: 'Policy deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== EMAIL ROUTES ====================
app.get('/api/emails', authMiddleware, async (req, res) => {
  try {
    const emails = await query(
      `SELECT e.*, u.name as sent_by_name, s.company_name as sub_name
       FROM email_log e
       LEFT JOIN users u ON u.id=e.sent_by
       LEFT JOIN subcontractors s ON s.id=e.sub_id
       ORDER BY e.sent_at DESC LIMIT 100`
    );
    res.json(emails);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/emails/send', authMiddleware, async (req, res) => {
  try {
    const { to_email, to_name, template_type, subject, body, sub_id, policy_id } = req.body;
    if (!to_email || !subject || !body) return res.status(400).json({ error: 'to_email, subject, and body are required' });

    const emailId = await sendMockEmail(to_email, to_name, template_type, subject, body, req.user.id, sub_id, policy_id);

    if (req.user.role !== 'admin') {
      await query(
        'INSERT INTO notifications (user_id,type,title,message,related_type,related_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [1, 'email_sent', 'Email Sent', `${req.user.name} sent a ${template_type} email to ${to_email}`, 'email', emailId]
      );
    }

    res.json({ id: emailId, message: 'Email sent successfully', preview: { to: to_email, subject, body } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== EMAIL TEMPLATE ROUTES ====================
app.get('/api/email-templates', authMiddleware, async (req, res) => {
  try {
    res.json(await query('SELECT * FROM email_templates WHERE is_active=TRUE ORDER BY template_type'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/email-templates', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { gc_id, template_type, name, subject, body } = req.body;
    const row = await queryOne(
      'INSERT INTO email_templates (gc_id,template_type,name,subject,body) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [gc_id||null, template_type, name, subject, body]
    );
    res.status(201).json({ id: row.id, message: 'Template created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/email-templates/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, subject, body } = req.body;
    await query('UPDATE email_templates SET name=$1,subject=$2,body=$3 WHERE id=$4', [name, subject, body, req.params.id]);
    res.json({ message: 'Template updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== NOTIFICATION ROUTES ====================
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const notifs = await query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]
    );
    const countRow = await queryOne(
      'SELECT COUNT(*) as c FROM notifications WHERE user_id=$1 AND is_read=FALSE', [req.user.id]
    );
    res.json({ notifications: notifs, unread_count: parseInt(countRow.c) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Marked as read' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read=TRUE WHERE user_id=$1', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notifications/check-expirations', authMiddleware, adminOnly, async (req, res) => {
  try {
    const expiring = await query(
      `SELECT p.*, s.company_name as sub_name FROM insurance_policies p
       JOIN subcontractors s ON s.id=p.sub_id
       WHERE p.expiration_date IS NOT NULL AND p.status != 'expired'`
    );

    let created = 0;
    for (const p of expiring) {
      const days = getDaysUntilExpiration(p.expiration_date);
      if (days !== null && days <= 0) {
        await query('UPDATE insurance_policies SET status=\'expired\' WHERE id=$1', [p.id]);
      } else if (days !== null && days <= 30) {
        const existing = await queryOne(
          'SELECT id FROM notifications WHERE related_id=$1 AND type=$2 AND is_read=FALSE',
          [p.id, 'expiration_warning']
        );
        if (!existing) {
          const label = p.policy_type === 'general_liability' ? 'General Liability' : "Workers' Comp";
          await query(
            'INSERT INTO notifications (user_id,type,title,message,related_type,related_id) VALUES ($1,$2,$3,$4,$5,$6)',
            [1, 'expiration_warning', 'Policy Expiring Soon',
             `${p.sub_name} – ${label} expires in ${days} days`, 'policy', p.id]
          );
          created++;
        }
      }
    }

    res.json({ message: `Checked ${expiring.length} policies, created ${created} notifications` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== DASHBOARD ROUTES ====================
app.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const [totalSubs, totalGCs, totalAgents] = await Promise.all([
        queryOne('SELECT COUNT(*) as c FROM subcontractors'),
        queryOne('SELECT COUNT(*) as c FROM general_contractors'),
        queryOne('SELECT COUNT(*) as c FROM insurance_agents'),
      ]);

      const allSubIds = await query('SELECT id FROM subcontractors');
      const statuses = await Promise.all(allSubIds.map(r => computeSubStatus(r.id)));
      const stats = statuses.reduce((acc, st) => {
        if (st === 'active') acc.active++;
        else if (st === 'expiring_soon') acc.expiringSoon++;
        else if (st === 'non_compliant') acc.nonCompliant++;
        else acc.pending++;
        return acc;
      }, { active: 0, expiringSoon: 0, nonCompliant: 0, pending: 0 });

      const [recentEmails, expiringPolicies, recentActivity] = await Promise.all([
        queryOne("SELECT COUNT(*) as c FROM email_log WHERE sent_at > NOW() - INTERVAL '7 days'"),
        query(
          `SELECT p.*, s.company_name as sub_name, a.name as agent_name, a.email as agent_email
           FROM insurance_policies p
           JOIN subcontractors s ON s.id=p.sub_id
           LEFT JOIN insurance_agents a ON a.id=p.agent_id
           WHERE p.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
             AND p.status != 'expired'
           ORDER BY p.expiration_date`
        ),
        query('SELECT * FROM email_log ORDER BY sent_at DESC LIMIT 5'),
      ]);

      res.json({
        role: 'admin',
        stats: { totalSubs: parseInt(totalSubs.c), totalGCs: parseInt(totalGCs.c), totalAgents: parseInt(totalAgents.c),
          recentEmails: parseInt(recentEmails.c), ...stats },
        expiringPolicies,
        recentActivity,
      });

    } else if (req.user.role === 'general_contractor') {
      const gc = await queryOne('SELECT * FROM general_contractors WHERE user_id=$1', [req.user.id]);
      if (!gc) return res.json({ role: 'general_contractor', stats: {}, subs: [] });

      const subs = await query(
        `SELECT s.* FROM subcontractors s JOIN gc_subcontractor gcs ON gcs.sub_id=s.id
         WHERE gcs.gc_id=$1 AND gcs.is_active=TRUE`, [gc.id]
      );

      const enrichedSubs = await Promise.all(subs.map(async s => {
        const st = await computeSubStatus(s.id);
        const policies = await query('SELECT * FROM insurance_policies WHERE sub_id=$1', [s.id]);
        return { ...s, computed_status: st, policy_count: policies.length };
      }));

      const statCounts = enrichedSubs.reduce((acc, s) => {
        if (s.computed_status === 'active') acc.active++;
        else if (s.computed_status === 'expiring_soon') acc.expiringSoon++;
        else if (s.computed_status === 'non_compliant') acc.nonCompliant++;
        else acc.pending++;
        return acc;
      }, { active: 0, expiringSoon: 0, nonCompliant: 0, pending: 0 });

      res.json({
        role: 'general_contractor', gc,
        stats: { totalSubs: subs.length, ...statCounts },
        subs: enrichedSubs,
      });

    } else {
      res.json({ role: req.user.role, message: 'Dashboard not available for this role' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/compliance', authMiddleware, adminOnly, async (req, res) => {
  try {
    const subs = await query('SELECT * FROM subcontractors ORDER BY company_name');
    const report = await Promise.all(subs.map(async s => {
      const policies = await query(
        `SELECT p.*, a.name as agent_name FROM insurance_policies p
         LEFT JOIN insurance_agents a ON a.id=p.agent_id WHERE p.sub_id=$1`, [s.id]
      );
      const gl = policies.find(p => p.policy_type === 'general_liability') || null;
      const wc = policies.find(p => p.policy_type === 'workers_comp') || null;
      const gcs = await query(
        `SELECT gc.company_name FROM general_contractors gc
         JOIN gc_subcontractor gcs ON gcs.gc_id=gc.id
         WHERE gcs.sub_id=$1 AND gcs.is_active=TRUE`, [s.id]
      );
      return {
        ...s,
        computed_status: await computeSubStatus(s.id),
        gl_policy: gl ? { ...gl, days_remaining: getDaysUntilExpiration(gl.expiration_date) } : null,
        wc_policy: wc ? { ...wc, days_remaining: getDaysUntilExpiration(wc.expiration_date) } : null,
        general_contractors: gcs.map(g => g.company_name),
      };
    }));
    res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== CATCH-ALL (SPA) ====================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START ====================
// Works locally (node server.js) AND on Vercel (exported as module)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🏗️  InsureTrack running at http://localhost:${PORT}`);
    console.log(`\nDemo Accounts:`);
    console.log(`  Admin:   dawn@insuretrack.com  / admin123`);
    console.log(`  GC #1:   tom@apexbuilding.com  / gc123`);
    console.log(`  GC #2:   sarah@mountaincrest.com / gc123`);
    console.log(`  Agent:   mike@idahofirst.com   / agent123\n`);
  });
}

module.exports = app;
