const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { db, PDF_DIR } = require('./db');
const { hashPassword, verifyPassword, createSession, getUserFromToken, destroySession, log } = require('./auth');
const { genererBonDeSortie, genererRapportJournalierBilletterie } = require('./pdfgen');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 30 * 1024 * 1024) req.destroy(); // 30MB safety cap (images)
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function getAuthUser(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  return getUserFromToken(token);
}

function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) { sendJSON(res, 401, { error: 'Non authentifié' }); return null; }
  if (user.statut !== 'actif') { sendJSON(res, 403, { error: 'Compte non actif' }); return null; }
  return user;
}

function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    sendJSON(res, 403, { error: 'Accès réservé aux administrateurs' });
    return null;
  }
  return user;
}

function publicUser(u) {
  return { id: u.id, nom: u.nom, prenom: u.prenom, email: u.email, telephone: u.telephone, role: u.role, statut: u.statut };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, data2) => {
        if (err2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;
  let m;

  try {
    // ---------- ONBOARDING ----------
    if (pathname === '/api/onboarding/status' && method === 'GET') {
      const count = db.prepare('SELECT COUNT(*) as c FROM users WHERE role = ?').get('super_admin');
      return sendJSON(res, 200, { needsOnboarding: count.c === 0 });
    }

    if (pathname === '/api/onboarding' && method === 'POST') {
      const count = db.prepare('SELECT COUNT(*) as c FROM users WHERE role = ?').get('super_admin');
      if (count.c > 0) return sendJSON(res, 409, { error: 'Un administrateur existe déjà' });
      const b = await readBody(req);
      if (!b.email || !b.password || !b.nom || !b.prenom) return sendJSON(res, 400, { error: 'Champs manquants' });
      const { hash, salt } = hashPassword(b.password);
      const info = db.prepare(`INSERT INTO users (nom, prenom, telephone, email, password_hash, password_salt, role, statut, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'super_admin', 'actif', ?)`)
        .run(b.nom, b.prenom, b.telephone || '', b.email.toLowerCase(), hash, salt, new Date().toISOString());
      const token = createSession(info.lastInsertRowid);
      log(info.lastInsertRowid, 'onboarding_admin_cree', b.email);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      return sendJSON(res, 201, { token, user: publicUser(user) });
    }

    // ---------- AUTH ----------
    if (pathname === '/api/auth/register' && method === 'POST') {
      const b = await readBody(req);
      if (!b.email || !b.password || !b.nom || !b.prenom) return sendJSON(res, 400, { error: 'Champs manquants' });
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(b.email.toLowerCase());
      if (existing) return sendJSON(res, 409, { error: 'Cet email est déjà utilisé' });
      const { hash, salt } = hashPassword(b.password);
      const info = db.prepare(`INSERT INTO users (nom, prenom, telephone, email, password_hash, password_salt, role, statut, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'utilisateur', 'en_attente', ?)`)
        .run(b.nom, b.prenom, b.telephone || '', b.email.toLowerCase(), hash, salt, new Date().toISOString());
      log(info.lastInsertRowid, 'inscription', b.email);
      return sendJSON(res, 201, { message: 'Compte créé, en attente de validation par un administrateur.' });
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const b = await readBody(req);
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get((b.email || '').toLowerCase());
      if (!user || !verifyPassword(b.password || '', user.password_salt, user.password_hash)) {
        return sendJSON(res, 401, { error: 'Identifiants incorrects' });
      }
      if (user.statut === 'en_attente') return sendJSON(res, 403, { error: 'Compte en attente de validation par un administrateur.' });
      if (user.statut === 'rejete') return sendJSON(res, 403, { error: 'Ce compte a été rejeté.' });
      const token = createSession(user.id);
      log(user.id, 'connexion');
      return sendJSON(res, 200, { token, user: publicUser(user) });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token) destroySession(token);
      return sendJSON(res, 200, { ok: true });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = getAuthUser(req);
      if (!user) return sendJSON(res, 401, { error: 'Non authentifié' });
      return sendJSON(res, 200, { user: publicUser(user) });
    }

    if (pathname === '/api/auth/change-password' && method === 'POST') {
      const user = requireAuth(req, res); if (!user) return;
      const b = await readBody(req);
      if (!b.currentPassword || !b.newPassword) return sendJSON(res, 400, { error: 'Champs manquants' });
      if (!verifyPassword(b.currentPassword, user.password_salt, user.password_hash)) {
        return sendJSON(res, 401, { error: 'Mot de passe actuel incorrect' });
      }
      if (b.newPassword.length < 6) return sendJSON(res, 400, { error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
      const { hash, salt } = hashPassword(b.newPassword);
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, user.id);
      log(user.id, 'mot_de_passe_change');
      return sendJSON(res, 200, { ok: true });
    }

    // ---------- GESTION DES UTILISATEURS (admin) ----------
    if (pathname === '/api/users' && method === 'GET') {
      const admin = requireAdmin(req, res); if (!admin) return;
      const rows = db.prepare("SELECT * FROM users WHERE statut = 'actif' ORDER BY nom ASC").all();
      return sendJSON(res, 200, { users: rows.map(publicUser) });
    }

    m = pathname.match(/^\/api\/users\/(\d+)\/role$/);
    if (m && method === 'POST') {
      const admin = requireAdmin(req, res); if (!admin) return;
      if (admin.role !== 'super_admin') return sendJSON(res, 403, { error: 'Réservé au Super-Admin' });
      const id = Number(m[1]);
      const b = await readBody(req);
      if (!['utilisateur', 'admin', 'super_admin'].includes(b.role)) return sendJSON(res, 400, { error: 'Rôle invalide' });
      if (b.role !== 'super_admin') {
        const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (target && target.role === 'super_admin') {
          const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'super_admin'").get().c;
          if (count <= 1) return sendJSON(res, 400, { error: 'Impossible de retirer le dernier Super-Admin' });
        }
      }
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role, id);
      log(admin.id, 'role_modifie', `${id}:${b.role}`);
      return sendJSON(res, 200, { ok: true });
    }

    m = pathname.match(/^\/api\/users\/(\d+)\/reset-password$/);
    if (m && method === 'POST') {
      const admin = requireAdmin(req, res); if (!admin) return;
      if (admin.role !== 'super_admin') return sendJSON(res, 403, { error: 'Réservé au Super-Admin' });
      const id = Number(m[1]);
      const b = await readBody(req);
      if (!b.newPassword || b.newPassword.length < 6) return sendJSON(res, 400, { error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
      const { hash, salt } = hashPassword(b.newPassword);
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, id);
      log(admin.id, 'mot_de_passe_reinitialise', String(id));
      return sendJSON(res, 200, { ok: true });
    }

    if (pathname === '/api/users/pending' && method === 'GET') {
      const user = requireAdmin(req, res); if (!user) return;
      const rows = db.prepare("SELECT * FROM users WHERE statut = 'en_attente' ORDER BY created_at DESC").all();
      return sendJSON(res, 200, { users: rows.map(publicUser) });
    }

    m = pathname.match(/^\/api\/users\/(\d+)\/(approve|reject)$/);
    if (m && method === 'POST') {
      const admin = requireAdmin(req, res); if (!admin) return;
      const id = Number(m[1]);
      const statut = m[2] === 'approve' ? 'actif' : 'rejete';
      db.prepare('UPDATE users SET statut = ? WHERE id = ?').run(statut, id);
      log(admin.id, `utilisateur_${statut}`, String(id));
      return sendJSON(res, 200, { ok: true });
    }

    // ---------- RESSOURCES : COMPTES ----------
    if (pathname === '/api/comptes' && method === 'GET') {
      const user = requireAuth(req, res); if (!user) return;
      const rows = db.prepare('SELECT * FROM comptes_ressources ORDER BY id DESC').all();
      return sendJSON(res, 200, { comptes: rows });
    }

    if (pathname === '/api/comptes' && method === 'POST') {
      const user = requireAuth(req, res); if (!user) return;
      const b = await readBody(req);
      if (!b.type || !b.libelle) return sendJSON(res, 400, { error: 'Champs manquants' });
      const info = db.prepare('INSERT INTO comptes_ressources (type, libelle, solde) VALUES (?, ?, ?)')
        .run(b.type, b.libelle, Number(b.solde) || 0);
      log(user.id, 'compte_cree', b.libelle);
      return sendJSON(res, 201, { id: info.lastInsertRowid });
    }

    m = pathname.match(/^\/api\/comptes\/(\d+)\/mouvement$/);
    if (m && method === 'POST') {
      const user = requireAuth(req, res); if (!user) return;
      const id = Number(m[1]);
      const b = await readBody(req);
      const compte = db.prepare('SELECT * FROM comptes_ressources WHERE id = ?').get(id);
      if (!compte) return sendJSON(res, 404, { error: 'Compte introuvable' });
      const montant = Number(b.montant) || 0;
      const delta = b.type === 'entree' ? montant : -montant;
      db.prepare('UPDATE comptes_ressources SET solde = solde + ? WHERE id = ?').run(delta, id);
      db.prepare('INSERT INTO mouvements_financiers (compte_id, type, montant, motif, date, utilisateur_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, b.type, montant, b.motif || '', b.date || new Date().toISOString().slice(0, 10), user.id);
      log(user.id, 'mouvement_financier', `${b.type}:${montant}`);
      return sendJSON(res, 201, { ok: true });
    }

    // ---------- RESSOURCES : MATERIELS ----------
    if (pathname === '/api/materiels' && method === 'GET') {
      const user = requireAuth(req, res); if (!user) return;
      const rows = db.prepare('SELECT * FROM materiels ORDER BY id DESC').all();
      return sendJSON(res, 200, { materiels: rows });
    }

    if (pathname === '/api/materiels' && method === 'POST') {
      const user = requireAuth(req, res); if (!user) return;
      const b = await readBody(req);
      if (!b.nom) return sendJSON(res, 400, { error: 'Nom requis' });
      const info = db.prepare('INSERT INTO materiels (nom, categorie, quantite, etat, emplacement) VALUES (?, ?, ?, ?, ?)')
        .run(b.nom, b.categorie || '', Number(b.quantite) || 0, b.etat || 'bon', b.emplacement || '');
      log(user.id, 'materiel_cree', b.nom);
      return sendJSON(res, 201, { id: info.lastInsertRowid });
    }

    m = pathname.match(/^\/api\/materiels\/(\d+)$/);
    if (m && method === 'PUT') {
      const user = requireAuth(req, res); if (!user) return;
      const id = Number(m[1]);
      const b = await readBody(req);
      db.prepare('UPDATE materiels SET nom=?, categorie=?, quantite=?, etat=?, emplacement=? WHERE id=?')
        .run(b.nom, b.categorie || '', Number(b.quantite) || 0, b.etat || '', b.emplacement || '', id);
      log(user.id, 'materiel_modifie', String(id));
      return sendJSON(res, 200, { ok: true });
    }

    // ---------- BONS DE SORTIE ----------
    if (pathname === '/api/bons' && method === 'GET') {
      const user = requireAuth(req, res); if (!user) return;
      const rows = db.prepare('SELECT * FROM bons_de_sortie ORDER BY id DESC').all();
      return sendJSON(res, 200, { bons: rows });
    }

    if (pathname === '/api/bons' && method === 'POST') {
      const user = requireAuth(req, res); if (!user) return;
      const b = await readBody(req);
      if (!b.date || !b.motif || !b.beneficiaire || !b.type_ressource) {
        return sendJSON(res, 400, { error: 'Champs manquants' });
      }
      const info = db.prepare(`INSERT INTO bons_de_sortie (date, motif, beneficiaire, type_ressource, montant, materiel_liste, cree_par, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(b.date, b.motif, b.beneficiaire, b.type_ressource, b.montant ? Number(b.montant) : null, b.materiel_liste || null, user.id, new Date().toISOString());
      const bon = db.prepare('SELECT * FROM bons_de_sortie WHERE id = ?').get(info.lastInsertRowid);
      const identite = db.prepare('SELECT * FROM identite_structure WHERE id = 1').get();
      const filename = await genererBonDeSortie(bon, identite);
      db.prepare('UPDATE bons_de_sortie SET pdf_path = ? WHERE id = ?').run(filename, bon.id);
      log(user.id, 'bon_de_sortie_cree', String(bon.id));
      return sendJSON(res, 201, { id: bon.id, pdf_url: `/api/bons/${bon.id}/pdf` });
    }

    m = pathname.match(/^\/api\/bons\/(\d+)\/pdf$/);
    if (m && method === 'GET') {
      let user = getAuthUser(req);
      if (!user && parsed.query && parsed.query.token) user = getUserFromToken(parsed.query.token);
      if (!user || user.statut !== 'actif') return sendJSON(res, 401, { error: 'Non authentifié' });
      const id = Number(m[1]);
      const bon = db.prepare('SELECT * FROM bons_de_sortie WHERE id = ?').get(id);
      if (!bon || !bon.pdf_path) return sendJSON(res, 404, { error: 'PDF introuvable' });
      const filePath = path.join(PDF_DIR, bon.pdf_path);
      if (!fs.existsSync(filePath)) return sendJSON(res, 404, { error: 'Fichier introuvable' });
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="bon-${id}.pdf"` });
      return res.end(data);
    }

    // ---------- IDENTITE STRUCTURE ----------
    if (pathname === '/api/identite' && method === 'GET') {
      const user = requireAuth(req, res); if (!user) return;
      const row = db.prepare('SELECT * FROM identite_structure WHERE id = 1').get();
      return sendJSON(res, 200, { identite: row || null });
    }

    if (pathname === '/api/identite' && method === 'POST') {
      const user = requireAdmin(req, res); if (!user) return;
      const b = await readBody(req);
      const existing = db.prepare('SELECT * FROM identite_structure WHERE id = 1').get();
      if (existing) {
        db.prepare(`UPDATE identite_structure SET nom_structure=?, logo_base64=COALESCE(?, logo_base64),
          tampon_base64=COALESCE(?, tampon_base64), signature_base64=COALESCE(?, signature_base64), updated_at=? WHERE id=1`)
          .run(b.nom_structure || existing.nom_structure, b.logo_base64 || null, b.tampon_base64 || null, b.signature_base64 || null, new Date().toISOString());
      } else {
        db.prepare(`INSERT INTO identite_structure (id, nom_structure, logo_base64, tampon_base64, signature_base64, updated_at)
          VALUES (1, ?, ?, ?, ?, ?)`)
          .run(b.nom_structure || '', b.logo_base64 || null, b.tampon_base64 || null, b.signature_base64 || null, new Date().toISOString());
      }
      log(user.id, 'identite_modifiee');
      return sendJSON(res, 200, { ok: true });
    }

    // ---------- BILLETTERIE ----------
    if (pathname === '/api/billetterie/vendeuses' && method === 'GET') {
      const user = requireAuth(req, res); if (!user) return;
      const rows = db.prepare('SELECT * FROM billetterie_vendeuses ORDER BY nom ASC').all();
      return sendJSON(res, 200, { vendeuses: rows });
    }

    if (pathname === '/api/billetterie/vendeuses' && method === 'POST') {
      const user = requireAuth(req, res); if (!user) return;
      const b = await readBody(req);
      if (!b.nom) return sendJSON(res, 400, { error: 'Nom requis' });
      const info = db.prepare('INSERT INTO billetterie_vendeuses (nom, telephone) VALUES (?, ?)').run(b.nom, b.telephone || '');
      log(user.id, 'vendeuse_creee', b.nom);
      return sendJSON(res, 201, { id: info.lastInsertRowid });
    }

    if (pathname === '/api/billetterie/ventes' && method === 'GET') {
      const user = requireAuth(req, res); if (!user) return;
      const q = parsed.query || {};
      let rows;
      if (q.date) {
        rows = db.prepare(`SELECT v.*, s.nom as vendeuse_nom FROM billetterie_ventes v
          JOIN billetterie_vendeuses s ON s.id = v.vendeuse_id WHERE v.date = ? ORDER BY v.id DESC`).all(q.date);
      } else {
        rows = db.prepare(`SELECT v.*, s.nom as vendeuse_nom FROM billetterie_ventes v
          JOIN billetterie_vendeuses s ON s.id = v.vendeuse_id ORDER BY v.date DESC, v.id DESC LIMIT 200`).all();
      }
      return sendJSON(res, 200, { ventes: rows });
    }

    if (pathname === '/api/billetterie/ventes' && method === 'POST') {
      const user = requireAuth(req, res); if (!user) return;
      const b = await readBody(req);
      if (!b.date || !b.vendeuse_id || !b.prix_billet) return sendJSON(res, 400, { error: 'Champs manquants' });
      const prix = Number(b.prix_billet);
      if (prix < 500 || prix > 10000) return sendJSON(res, 400, { error: 'Le prix du billet doit être entre 500 et 10000 FCFA' });
      const pris = Number(b.billets_pris) || 0;
      const vendus = Number(b.billets_vendus) || 0;
      if (vendus > pris) return sendJSON(res, 400, { error: 'Le nombre de billets vendus dépasse le nombre pris' });
      if (pris > 1000 || vendus > 1000) return sendJSON(res, 400, { error: 'Le nombre de billets doit être compris entre 0 et 1000' });
      const info = db.prepare(`INSERT INTO billetterie_ventes (date, vendeuse_id, prix_billet, billets_pris, billets_vendus, montant_verse, paiement_hotesse, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(b.date, Number(b.vendeuse_id), prix, pris, vendus, Number(b.montant_verse) || 0, Number(b.paiement_hotesse) || 0, new Date().toISOString());
      log(user.id, 'vente_billetterie_creee', String(info.lastInsertRowid));
      return sendJSON(res, 201, { id: info.lastInsertRowid });
    }

    m = pathname.match(/^\/api\/billetterie\/ventes\/(\d+)$/);
    if (m && method === 'PUT') {
      const user = requireAuth(req, res); if (!user) return;
      const id = Number(m[1]);
      const b = await readBody(req);
      const prix = Number(b.prix_billet);
      const pris = Number(b.billets_pris) || 0;
      const vendus = Number(b.billets_vendus) || 0;
      if (vendus > pris) return sendJSON(res, 400, { error: 'Le nombre de billets vendus dépasse le nombre pris' });
      db.prepare(`UPDATE billetterie_ventes SET prix_billet=?, billets_pris=?, billets_vendus=?, montant_verse=?, paiement_hotesse=? WHERE id=?`)
        .run(prix, pris, vendus, Number(b.montant_verse) || 0, Number(b.paiement_hotesse) || 0, id);
      log(user.id, 'vente_billetterie_modifiee', String(id));
      return sendJSON(res, 200, { ok: true });
    }

    m = pathname.match(/^\/api\/billetterie\/rapport\/([\d-]+)\/pdf$/);
    if (m && method === 'GET') {
      let user = getAuthUser(req);
      if (!user && parsed.query && parsed.query.token) user = getUserFromToken(parsed.query.token);
      if (!user || user.statut !== 'actif') return sendJSON(res, 401, { error: 'Non authentifié' });
      const date = m[1];
      const lignes = db.prepare(`SELECT v.*, s.nom as vendeuse_nom FROM billetterie_ventes v
        JOIN billetterie_vendeuses s ON s.id = v.vendeuse_id WHERE v.date = ? ORDER BY s.nom ASC`).all(date);
      const identite = db.prepare('SELECT * FROM identite_structure WHERE id = 1').get();
      const filename = await genererRapportJournalierBilletterie(date, lignes, identite);
      const filePath = path.join(PDF_DIR, filename);
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="rapport-${date}.pdf"` });
      return res.end(data);
    }

    // ---------- STATISTIQUES ----------
    if (pathname === '/api/stats' && method === 'GET') {
      const user = requireAuth(req, res); if (!user) return;
      const soldeTotal = db.prepare('SELECT COALESCE(SUM(solde),0) as s FROM comptes_ressources').get().s;
      const now = new Date();
      const moisPrefix = now.toISOString().slice(0, 7); // YYYY-MM
      const depensesMois = db.prepare("SELECT COALESCE(SUM(montant),0) as s FROM mouvements_financiers WHERE type='sortie' AND date LIKE ?").get(moisPrefix + '%').s;
      const entreesMois = db.prepare("SELECT COALESCE(SUM(montant),0) as s FROM mouvements_financiers WHERE type='entree' AND date LIKE ?").get(moisPrefix + '%').s;
      const topCategories = db.prepare(`SELECT motif, SUM(montant) as total FROM mouvements_financiers WHERE type='sortie' GROUP BY motif ORDER BY total DESC LIMIT 5`).all();
      const evolution = db.prepare(`SELECT substr(date,1,7) as mois, type, SUM(montant) as total FROM mouvements_financiers GROUP BY mois, type ORDER BY mois ASC`).all();
      const bonsCount = db.prepare('SELECT COUNT(*) as c FROM bons_de_sortie').get().c;
      const materielRotation = db.prepare(`SELECT materiel_liste, COUNT(*) as sorties FROM bons_de_sortie WHERE type_ressource='materiel' AND date LIKE ? GROUP BY materiel_liste ORDER BY sorties DESC LIMIT 5`).all(moisPrefix + '%');
      return sendJSON(res, 200, { soldeTotal, depensesMois, entreesMois, topCategories, evolution, bonsCount, materielRotation });
    }

    // ---------- STATIC / SPA ----------
    if (method === 'GET') return serveStatic(req, res, pathname);

    return sendJSON(res, 404, { error: 'Route introuvable' });
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: 'Erreur serveur', details: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`DIABYCIT EVEN'S démarré sur http://localhost:${PORT}`);
});
