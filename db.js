const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'diabycit.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT, prenom TEXT, telephone TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'utilisateur',
  statut TEXT NOT NULL DEFAULT 'en_attente',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comptes_ressources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  libelle TEXT NOT NULL,
  solde REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS materiels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  categorie TEXT,
  quantite INTEGER NOT NULL DEFAULT 0,
  etat TEXT,
  emplacement TEXT
);

CREATE TABLE IF NOT EXISTS mouvements_financiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compte_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  montant REAL NOT NULL,
  motif TEXT,
  date TEXT NOT NULL,
  utilisateur_id INTEGER
);

CREATE TABLE IF NOT EXISTS bons_de_sortie (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  motif TEXT NOT NULL,
  beneficiaire TEXT NOT NULL,
  type_ressource TEXT NOT NULL,
  montant REAL,
  materiel_liste TEXT,
  pdf_path TEXT,
  cree_par INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identite_structure (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nom_structure TEXT,
  logo_base64 TEXT,
  tampon_base64 TEXT,
  signature_base64 TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS journal_activite (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utilisateur_id INTEGER,
  action TEXT NOT NULL,
  cible TEXT,
  date TEXT NOT NULL
);
`);

module.exports = { db, PDF_DIR, DATA_DIR };
