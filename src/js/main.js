/**
 * Expatur Backoffice — Entry Point
 *
 * Ordem de inicialização:
 *  1. storage.js  — abstração localStorage ↔ Supabase
 *  2. app.js      — toda a lógica de negócios (extraída do index.html)
 */

// Storage abstraction (must come before app.js)
import './storage.js';

// All business logic (extracted verbatim from index.html)
import './app.js';
