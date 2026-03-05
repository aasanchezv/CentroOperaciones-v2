-- ============================================================
-- SEED: Datos de prueba — Centro de Operaciones Murguía
-- 22 cuentas · 42 contactos · 100 pólizas
-- Agente asignado : rwilton@murguia.com
-- Email de contacto: cmireles@murguia.com
--
-- ⚠️  Ejecutar UNA SOLA VEZ en el SQL Editor de Supabase:
--     https://supabase.com/dashboard/project/hocgbvfowkpufsiquozt/sql/new
--
-- O via CLI (con supabase vinculado):
--     ~/bin/supabase db execute --project-ref hocgbvfowkpufsiquozt \
--       -f supabase/seed_test_data.sql
-- ============================================================

DO $$
DECLARE
  agent_id   UUID;
  creator_id UUID;

  -- 12 empresas
  a01 UUID := gen_random_uuid();  -- Grupo Industrial Monterrey
  a02 UUID := gen_random_uuid();  -- Constructora Noreste
  a03 UUID := gen_random_uuid();  -- Transportes del Pacífico
  a04 UUID := gen_random_uuid();  -- Clínica Médica San Ángel
  a05 UUID := gen_random_uuid();  -- Hotel Hacienda Real
  a06 UUID := gen_random_uuid();  -- Distribuidora Morales e Hijos
  a07 UUID := gen_random_uuid();  -- Soft Technology
  a08 UUID := gen_random_uuid();  -- Agrícola Los Pinos
  a09 UUID := gen_random_uuid();  -- Universidad Regional del Norte
  a10 UUID := gen_random_uuid();  -- Inmobiliaria Pedregal
  a11 UUID := gen_random_uuid();  -- Fabricaciones Metálicas Juárez
  a12 UUID := gen_random_uuid();  -- Restaurantes La Hacienda

  -- 10 personas físicas
  a13 UUID := gen_random_uuid();  -- Alejandro García Hernández
  a14 UUID := gen_random_uuid();  -- María del Carmen Flores Torres
  a15 UUID := gen_random_uuid();  -- Roberto Jiménez Ortega
  a16 UUID := gen_random_uuid();  -- Patricia Sánchez Vega (prospect)
  a17 UUID := gen_random_uuid();  -- Carlos Alberto López Reyes
  a18 UUID := gen_random_uuid();  -- Diana Morales Herrera
  a19 UUID := gen_random_uuid();  -- Fernando Ruiz Castillo
  a20 UUID := gen_random_uuid();  -- Sofía Mendoza Torres
  a21 UUID := gen_random_uuid();  -- Jorge Ramírez Peña
  a22 UUID := gen_random_uuid();  -- Laura Vidal Montoya

BEGIN

  -- ── Guard: verificar que los usuarios existen ────────────────────────
  SELECT id INTO agent_id   FROM profiles WHERE email = 'rwilton@murguia.com';
  SELECT id INTO creator_id FROM profiles WHERE email = 'cmireles@murguia.com';

  IF agent_id IS NULL THEN
    RAISE EXCEPTION
      'rwilton@murguia.com no encontrado en profiles. '
      'Asegúrate de que el usuario existe antes de ejecutar el seed.';
  END IF;

  IF creator_id IS NULL THEN
    RAISE EXCEPTION
      'cmireles@murguia.com no encontrado en profiles. '
      'Asegúrate de que el usuario existe antes de ejecutar el seed.';
  END IF;

  -- ── 1. CUENTAS (22) ─────────────────────────────────────────────────
  -- Se insertan todas como 'prospect'.
  -- El trigger sync_account_status_from_policies las actualiza a 'active'
  -- automáticamente al insertar las pólizas activas en el paso 3.

  INSERT INTO accounts
    (id, name, type, rfc, email, phone, status,
     industry_sector, source, assigned_to, created_by, notes)
  VALUES
    -- ── Empresas ────────────────────────────────────────────────────────
    (a01, 'Grupo Industrial Monterrey S.A. de C.V.', 'empresa',
      'GIM851201KX3', 'cmireles@murguia.com', '+52 81 8100 1200', 'prospect',
      'manufactura', 'cartera_existente', agent_id, creator_id,
      'Grupo manufacturero con plantas en Monterrey y Saltillo. Cliente desde 2019. Programa corporativo renovado anualmente.'),

    (a02, 'Constructora Noreste S.A. de C.V.', 'empresa',
      'CNO920615LP8', 'cmireles@murguia.com', '+52 81 8200 3400', 'prospect',
      'construccion', 'referido', agent_id, creator_id,
      'Empresa de construcción civil e infraestructura. Proyectos activos en NL y Coahuila. Requiere fianzas y RC por proyecto.'),

    (a03, 'Transportes del Pacífico S.A. de C.V.', 'empresa',
      'TPP880901MF2', 'cmireles@murguia.com', '+52 33 3300 5600', 'prospect',
      'transporte', 'prospecto_propio', agent_id, creator_id,
      'Transportista de carga por carretera rutas GDL-CDMX-MTY. Flotilla de 85 unidades. Renovación parcial cada año.'),

    (a04, 'Clínica Médica San Ángel', 'empresa',
      'CMS971115QW5', 'cmireles@murguia.com', '+52 55 5500 7800', 'prospect',
      'salud', 'referido', agent_id, creator_id,
      'Clínica privada de especialidades en CDMX. 120 empleados entre médicos y personal administrativo. Prioridad GMM y RC médica.'),

    (a05, 'Hotel Hacienda Real S.A. de C.V.', 'empresa',
      'HHR010320NT6', 'cmireles@murguia.com', '+52 81 8400 9000', 'prospect',
      'servicios', 'cartera_existente', agent_id, creator_id,
      'Hotel boutique 4 estrellas en San Pedro GG. 65 habitaciones, 90 empleados. Daños al inmueble prioritario.'),

    (a06, 'Distribuidora Morales e Hijos S.A. de C.V.', 'empresa',
      'DMH831028BC9', 'cmireles@murguia.com', '+52 81 8500 1100', 'prospect',
      'comercio', 'referido', agent_id, creator_id,
      'Distribuidora de consumo masivo. 3 centros de distribución en Monterrey. Flota propia de 40 vehículos.'),

    (a07, 'Soft Technology S.A. de C.V.', 'empresa',
      'STE151020AB1', 'cmireles@murguia.com', '+52 55 5600 2200', 'prospect',
      'tecnologia', 'web', agent_id, creator_id,
      'Empresa de desarrollo de software y consultoría IT. 180 empleados, 60% en home office. RC Profesional prioritario.'),

    (a08, 'Agrícola Los Pinos S.A. de C.V.', 'empresa',
      'ALP780510CD4', 'cmireles@murguia.com', '+52 871 712 3456', 'prospect',
      'agro', 'prospecto_propio', agent_id, creator_id,
      'Empresa agrícola 850 ha en Tamaulipas. Cultivos de sorgo y maíz. Seguro de cosechas y equipo tractivo clave.'),

    (a09, 'Universidad Regional del Norte A.C.', 'empresa',
      'URN690312EF7', 'cmireles@murguia.com', '+52 81 8700 4400', 'prospect',
      'educacion', 'cartera_existente', agent_id, creator_id,
      'Universidad privada 4 campuses en NL. 3,800 alumnos y 450 empleados. GMM colectivo y RC civil prioritarios.'),

    (a10, 'Inmobiliaria Pedregal S.A. de C.V.', 'empresa',
      'IPE020814GH8', 'cmireles@murguia.com', '+52 55 5800 6600', 'prospect',
      'inmobiliaria', 'referido', agent_id, creator_id,
      'Desarrolladora y administradora de inmuebles en CDMX. Portafolio de 22 propiedades. Daños a propiedades es su programa más relevante.'),

    (a11, 'Fabricaciones Metálicas Juárez S.A. de C.V.', 'empresa',
      'FMJ950603IJ0', 'cmireles@murguia.com', '+52 656 612 7800', 'prospect',
      'manufactura', 'prospecto_propio', agent_id, creator_id,
      'Maquiladora metalmecánica en Ciudad Juárez. Exporta 70% a EUA. 320 empleados. Riesgos Técnicos es su póliza más relevante.'),

    (a12, 'Restaurantes La Hacienda S.A. de C.V.', 'empresa',
      'RLH030225KL3', 'cmireles@murguia.com', '+52 81 8900 8800', 'prospect',
      'servicios', 'referido', agent_id, creator_id,
      'Cadena de 7 restaurantes de comida mexicana en ZMM. 280 empleados. Daños e incendio prioritarios.'),

    -- ── Personas físicas ────────────────────────────────────────────────
    (a13, 'Alejandro García Hernández', 'persona_fisica',
      'GARH801215MN2', 'cmireles@murguia.com', '+52 81 8111 0001', 'prospect',
      NULL, 'referido', agent_id, creator_id,
      'Empresario, socio de Grupo Industrial Monterrey. Seguros personales y familiares. Reside en San Pedro GG.'),

    (a14, 'María del Carmen Flores Torres', 'persona_fisica',
      'FOTM770830PQ5', 'cmireles@murguia.com', '+52 55 5222 0001', 'prospect',
      NULL, 'referido', agent_id, creator_id,
      'Arquitecta independiente en CDMX. Cartera de seguros personales. Auto Audi Q5 2023.'),

    (a15, 'Roberto Jiménez Ortega', 'persona_fisica',
      'JIOR690514RS8', 'cmireles@murguia.com', '+52 33 3333 0001', 'prospect',
      NULL, 'cartera_existente', agent_id, creator_id,
      'Director comercial en empresa privada en GDL. Familia de 4. GMM familiar y vida prioritarios.'),

    (a16, 'Dra. Patricia Sánchez Vega', 'persona_fisica',
      'SAVP851022TU1', 'cmireles@murguia.com', '+52 55 5444 0001', 'prospect',
      NULL, 'prospecto_propio', agent_id, creator_id,
      'Médico especialista CDMX. En proceso de cotización GMM y vida. Pendiente de contratación — examen médico en trámite.'),

    (a17, 'Carlos Alberto López Reyes', 'persona_fisica',
      'LORC910309VW4', 'cmireles@murguia.com', '+52 81 8555 0001', 'prospect',
      NULL, 'referido', agent_id, creator_id,
      'Contador público en Monterrey. Auto Honda Civic 2022. Interesado en incrementar suma asegurada de vida.'),

    (a18, 'Diana Morales Herrera', 'persona_fisica',
      'MOHD940717XY7', 'cmireles@murguia.com', '+52 55 5666 0001', 'prospect',
      NULL, 'red_social', agent_id, creator_id,
      'Diseñadora de interiores freelance en CDMX. Seguros personales. Auto SUV Toyota 2021.'),

    (a19, 'Fernando Ruiz Castillo', 'persona_fisica',
      'RUCF750228ZA0', 'cmireles@murguia.com', '+52 664 712 0001', 'prospect',
      NULL, 'cartera_existente', agent_id, creator_id,
      'Ejecutivo senior en maquiladora en Tijuana. Familia de 3. Programa completo de seguros personales.'),

    (a20, 'Dra. Sofía Mendoza Torres', 'persona_fisica',
      'METS881104BC3', 'cmireles@murguia.com', '+52 81 8888 0001', 'prospect',
      NULL, 'referido', agent_id, creator_id,
      'Odontóloga con consultorio propio en Monterrey. Auto VW Tiguan 2022 próximo a renovar.'),

    (a21, 'Lic. Jorge Ramírez Peña', 'persona_fisica',
      'RAPJ831219DE6', 'cmireles@murguia.com', '+52 55 5999 0001', 'prospect',
      NULL, 'referido', agent_id, creator_id,
      'Abogado corporativo en CDMX. Socio en despacho. Seguros personales y hogar en Lomas de Chapultepec.'),

    (a22, 'Laura Vidal Montoya', 'persona_fisica',
      'VIML920506FG9', 'cmireles@murguia.com', '+52 81 8000 1234', 'prospect',
      NULL, 'prospecto_propio', agent_id, creator_id,
      'Directora de marketing en empresa de consumo. Monterrey. Seguros personales básicos con potencial de crecimiento.');


  -- ── 2. CONTACTOS (42) ───────────────────────────────────────────────

  INSERT INTO contacts
    (account_id, full_name, email, phone, position, is_primary, created_by)
  VALUES
    -- a01 Grupo Industrial Monterrey (3)
    (a01, 'Ing. Luis Armando Garza Treviño',  'cmireles@murguia.com', '+52 81 8100 0001', 'Director General',               true,  creator_id),
    (a01, 'C.P. Alejandra Romo Navarro',       'cmireles@murguia.com', '+52 81 8100 0002', 'Gerente de Recursos Humanos',    false, creator_id),
    (a01, 'Lic. Marco Antonio Serna Pérez',    'cmireles@murguia.com', '+52 81 8100 0003', 'Gerente Financiero',             false, creator_id),

    -- a02 Constructora Noreste (2)
    (a02, 'Ing. Gerardo Villarreal Martínez',  'cmireles@murguia.com', '+52 81 8200 0001', 'Director General',               true,  creator_id),
    (a02, 'C.P. Rosa Elena Cantú Cisneros',    'cmireles@murguia.com', '+52 81 8200 0002', 'Administración y Finanzas',      false, creator_id),

    -- a03 Transportes del Pacífico (3)
    (a03, 'Lic. Héctor Manuel Álvarez Pérez',  'cmireles@murguia.com', '+52 33 3300 0001', 'Director Operativo',             true,  creator_id),
    (a03, 'Ing. Sandra Beatriz López Ruiz',    'cmireles@murguia.com', '+52 33 3300 0002', 'Coordinadora de Flota',          false, creator_id),
    (a03, 'C.P. Eduardo Torres Medina',        'cmireles@murguia.com', '+52 33 3300 0003', 'Contabilidad',                   false, creator_id),

    -- a04 Clínica Médica San Ángel (2)
    (a04, 'Dr. Javier Augusto Mendoza',        'cmireles@murguia.com', '+52 55 5500 0001', 'Director Médico',                true,  creator_id),
    (a04, 'Lic. Adriana Fuentes Ortega',       'cmireles@murguia.com', '+52 55 5500 0002', 'Directora de Recursos Humanos',  false, creator_id),

    -- a05 Hotel Hacienda Real (2)
    (a05, 'Lic. Carmen González Reyes',        'cmireles@murguia.com', '+52 81 8400 0001', 'Gerente General',                true,  creator_id),
    (a05, 'C.P. Roberto Salinas Leal',         'cmireles@murguia.com', '+52 81 8400 0002', 'Gerente Financiero',             false, creator_id),

    -- a06 Distribuidora Morales (3)
    (a06, 'Sr. Miguel Ángel Morales Herrera',  'cmireles@murguia.com', '+52 81 8500 0001', 'Director General',               true,  creator_id),
    (a06, 'Lic. Verónica Gutiérrez Soto',      'cmireles@murguia.com', '+52 81 8500 0002', 'Gerente de Operaciones',         false, creator_id),
    (a06, 'C.P. Arturo Campos Díaz',           'cmireles@murguia.com', '+52 81 8500 0003', 'Gerente Administrativo',         false, creator_id),

    -- a07 Soft Technology (2)
    (a07, 'Ing. Felipe Ramírez Castro',        'cmireles@murguia.com', '+52 55 5600 0001', 'CEO',                            true,  creator_id),
    (a07, 'Lic. Patricia Moreno Vega',         'cmireles@murguia.com', '+52 55 5600 0002', 'People & Culture Manager',       false, creator_id),

    -- a08 Agrícola Los Pinos (2)
    (a08, 'Sr. Ramón Castillo Juárez',         'cmireles@murguia.com', '+52 871 712 0001', 'Propietario / Director',         true,  creator_id),
    (a08, 'Ing. Graciela Méndez Rosales',      'cmireles@murguia.com', '+52 871 712 0002', 'Administración General',         false, creator_id),

    -- a09 Universidad Regional del Norte (3)
    (a09, 'Lic. Jorge Luis Pedraza Nájera',    'cmireles@murguia.com', '+52 81 8700 0001', 'Rector',                         true,  creator_id),
    (a09, 'C.P. Elvira Salazar Montes',        'cmireles@murguia.com', '+52 81 8700 0002', 'Directora de Finanzas',          false, creator_id),
    (a09, 'Lic. Fernando Quiroz Ibarra',       'cmireles@murguia.com', '+52 81 8700 0003', 'Director de Servicios Gles.',    false, creator_id),

    -- a10 Inmobiliaria Pedregal (2)
    (a10, 'Lic. Andrés Pedregal Ruiz',         'cmireles@murguia.com', '+52 55 5800 0001', 'Director General',               true,  creator_id),
    (a10, 'C.P. Isabela Domínguez Torres',     'cmireles@murguia.com', '+52 55 5800 0002', 'CFO',                            false, creator_id),

    -- a11 Fabricaciones Metálicas Juárez (3)
    (a11, 'Ing. Ernesto Juárez Morales',       'cmireles@murguia.com', '+52 656 612 0001', 'Director General',               true,  creator_id),
    (a11, 'C.P. Ana Lucía Hernández Bernal',   'cmireles@murguia.com', '+52 656 612 0002', 'CFO',                            false, creator_id),
    (a11, 'Ing. Víctor Manuel Ríos Cruz',      'cmireles@murguia.com', '+52 656 612 0003', 'Director de Planta',             false, creator_id),

    -- a12 Restaurantes La Hacienda (2)
    (a12, 'Sr. Alejandro Larralde Méndez',     'cmireles@murguia.com', '+52 81 8900 0001', 'Propietario / Director',         true,  creator_id),
    (a12, 'Lic. Daniela Reyes Ochoa',          'cmireles@murguia.com', '+52 81 8900 0002', 'Gerente Administrativa',         false, creator_id),

    -- Personas físicas — contratante es el contacto primario
    (a13, 'Alejandro García Hernández',        'cmireles@murguia.com', '+52 81 8111 0001', 'Empresario / Socio',             true,  creator_id),
    (a13, 'Mariana Salinas García',            'cmireles@murguia.com', '+52 81 8111 0002', 'Beneficiaria / Cónyuge',         false, creator_id),

    (a14, 'María del Carmen Flores Torres',    'cmireles@murguia.com', '+52 55 5222 0001', 'Arquitecta',                     true,  creator_id),

    (a15, 'Roberto Jiménez Ortega',            'cmireles@murguia.com', '+52 33 3333 0001', 'Director Comercial',             true,  creator_id),
    (a15, 'Claudia López de Jiménez',          'cmireles@murguia.com', '+52 33 3333 0002', 'Beneficiaria / Cónyuge',         false, creator_id),

    (a16, 'Dra. Patricia Sánchez Vega',        'cmireles@murguia.com', '+52 55 5444 0001', 'Médico Especialista',            true,  creator_id),

    (a17, 'Carlos Alberto López Reyes',        'cmireles@murguia.com', '+52 81 8555 0001', 'Contador Público',               true,  creator_id),
    (a17, 'Sandra Morales de López',           'cmireles@murguia.com', '+52 81 8555 0002', 'Beneficiaria / Cónyuge',         false, creator_id),

    (a18, 'Diana Morales Herrera',             'cmireles@murguia.com', '+52 55 5666 0001', 'Diseñadora de Interiores',       true,  creator_id),

    (a19, 'Fernando Ruiz Castillo',            'cmireles@murguia.com', '+52 664 712 0001', 'Ejecutivo Senior',               true,  creator_id),

    (a20, 'Dra. Sofía Mendoza Torres',         'cmireles@murguia.com', '+52 81 8888 0001', 'Odontóloga',                     true,  creator_id),

    (a21, 'Lic. Jorge Ramírez Peña',           'cmireles@murguia.com', '+52 55 5999 0001', 'Abogado Corporativo',            true,  creator_id),

    (a22, 'Laura Vidal Montoya',               'cmireles@murguia.com', '+52 81 8000 0001', 'Directora de Marketing',         true,  creator_id);


  -- ── 3. PÓLIZAS (100) ────────────────────────────────────────────────
  -- El trigger sync_account_status_from_policies actualizará las cuentas
  -- a 'active' automáticamente al insertar cada póliza activa.

  INSERT INTO policies
    (account_id, policy_number, branch, insurer, status,
     premium, start_date, end_date, notes, created_by, payment_frequency)
  VALUES

  -- ── a01 Grupo Industrial Monterrey (7) ────────────────────────────
  (a01, 'GNP-2024-010234', 'gmm',        'GNP',          'active',
    245000, '2024-01-15', '2026-12-31',
    'GMM colectivo Planta Monterrey. 420 empleados. Prima renovada enero 2024. Red Plus.',
    creator_id, 'anual'),

  (a01, 'GNP-2025-011450', 'gmm',        'GNP',          'active',
    128000, '2025-01-15', '2027-01-14',
    'GMM colectivo Planta Saltillo. 185 empleados. Recién incorporada al programa corporativo.',
    creator_id, 'anual'),

  (a01, 'MLF-2025-020810', 'vida',       'MetLife',      'active',
    95000,  '2025-03-01', '2026-12-31',
    'Vida grupo gerencial. 45 ejecutivos. Suma asegurada $2,500,000 c/u. Beneficiarios actualizados.',
    creator_id, 'anual'),

  (a01, 'AXA-2024-030567', 'danos',      'AXA Seguros',  'active',
    185000, '2024-07-01', '2026-06-30',
    'Daños incendio y robo Planta Monterrey. Valor declarado $85M. Cláusula de reposición a valor nuevo.',
    creator_id, 'anual'),

  (a01, 'HDI-2025-040123', 'rc',         'HDI Seguros',  'active',
    62000,  '2025-01-01', '2026-12-31',
    'RC General corporativa. Incluye RC patronal, RC productos y RC contratistas. Límite $10M.',
    creator_id, 'anual'),

  (a01, 'SUR-2025-050678', 'transporte', 'Sura',         'active',
    78000,  '2025-06-01', '2026-05-31',
    'Transporte terrestre mercancías MTY-CDMX-GDL. Valor mercancía asegurada $5M por viaje.',
    creator_id, 'semestral'),

  (a01, 'QLT-2025-060890', 'auto',       'Qualitas',     'pending_renewal',
    45000,  '2025-03-20', '2026-03-20',
    'Auto flotilla 12 vehículos ejecutivos. Cobertura amplia. RENOVACIÓN PRÓXIMA — cotizar descuento por flotilla.',
    creator_id, 'mensual'),

  -- ── a02 Constructora Noreste (5) ──────────────────────────────────
  (a02, 'AXA-2025-031245', 'rc',         'AXA Seguros',  'active',
    88000,  '2025-02-01', '2026-12-31',
    'RC Profesional contratistas y subcontratistas. Obras activas en NL y Coahuila.',
    creator_id, 'anual'),

  (a02, 'GNP-2024-012345', 'danos',      'GNP',          'active',
    142000, '2024-08-15', '2026-08-14',
    'Daños oficinas corporativas e instalaciones de obra. Incendio, robo, cristales.',
    creator_id, 'anual'),

  (a02, 'BBV-2025-070234', 'fianzas',    'BBVA Seguros', 'active',
    55000,  '2025-01-01', '2026-12-31',
    'Fianzas de fidelidad y cumplimiento de contratos gubernamentales. Límite $20M.',
    creator_id, 'anual'),

  (a02, 'QLT-2025-061234', 'auto',       'Qualitas',     'active',
    32000,  '2025-05-01', '2026-04-30',
    'Auto maquinaria ligera y vehículos de obra. 8 unidades. Cobertura amplia.',
    creator_id, 'anual'),

  (a02, 'HDI-2025-041567', 'transporte', 'HDI Seguros',  'active',
    28000,  '2025-07-01', '2026-06-30',
    'Transporte de equipos pesados en plataforma. Valor declarado $8M por viaje.',
    creator_id, 'anual'),

  -- ── a03 Transportes del Pacífico (5) ──────────────────────────────
  (a03, 'SUR-2025-051234', 'transporte', 'Sura',         'active',
    195000, '2025-01-01', '2026-12-31',
    'Transporte terrestre carga general. 85 unidades activas. Valor máx. de cargas $15M.',
    creator_id, 'anual'),

  (a03, 'QLT-2025-062345', 'auto',       'Qualitas',     'active',
    68000,  '2025-03-15', '2026-12-31',
    'Auto flotilla tractocamiones — grupo 1, 40 unidades. Cobertura amplia. Deducible $5K.',
    creator_id, 'mensual'),

  (a03, 'QLT-2025-062346', 'auto',       'Qualitas',     'active',
    72000,  '2024-06-01', '2026-05-31',
    'Auto flotilla tractocamiones — grupo 2, 45 unidades. Cobertura amplia. Deducible $5K.',
    creator_id, 'mensual'),

  (a03, 'HDI-2025-041890', 'rc',         'HDI Seguros',  'active',
    45000,  '2025-02-01', '2026-10-31',
    'RC transportista. Daños a terceros durante maniobras de carga y descarga. Límite $5M.',
    creator_id, 'anual'),

  (a03, 'GNP-2025-013456', 'danos',      'GNP',          'pending_renewal',
    38000,  '2025-04-10', '2026-03-28',
    'Daños almacén central Guadalajara. Incendio y robo contenidos. RENOVACIÓN PRÓXIMA — verificar incremento de valores.',
    creator_id, 'anual'),

  -- ── a04 Clínica Médica San Ángel (6) ──────────────────────────────
  (a04, 'GNP-2025-014567', 'gmm',        'GNP',          'active',
    165000, '2025-01-01', '2026-12-31',
    'GMM colectivo 120 empleados. Plan Plus red amplia. Maternidad incluida. Sin deducible hospitales de primer nivel.',
    creator_id, 'anual'),

  (a04, 'AXA-2024-032890', 'rc',         'AXA Seguros',  'active',
    120000, '2024-09-01', '2026-08-31',
    'RC Médica. Cubre malpractice individual y de la clínica. Límite $5M por reclamación.',
    creator_id, 'anual'),

  (a04, 'MLF-2025-021234', 'vida',       'MetLife',      'active',
    85000,  '2025-04-01', '2026-12-31',
    'Vida grupo médicos de planta y especialistas. 45 asegurados. Suma $3,000,000 c/u.',
    creator_id, 'anual'),

  (a04, 'ZCH-2025-080456', 'ap',         'Zurich',       'active',
    42000,  '2025-01-15', '2026-12-31',
    'AP personal médico. Inutilización total y parcial. $1,500,000 por evento. Incluye enfermedades profesionales.',
    creator_id, 'anual'),

  (a04, 'GNP-2024-015678', 'danos',      'GNP',          'active',
    95000,  '2024-11-01', '2026-10-31',
    'Daños inmueble clínica CDMX. Edificio 4 pisos, contenidos médicos incluidos. Pérdida de renta por 90 días.',
    creator_id, 'anual'),

  (a04, 'MPF-2025-090123', 'tecnicos',   'Mapfre',       'active',
    48000,  '2025-06-01', '2026-05-31',
    'Equipo médico electrónico: resonancia magnética, tomógrafo, ultrasonido. Valor $12M. Todo riesgo.',
    creator_id, 'anual'),

  -- ── a05 Hotel Hacienda Real (4) ────────────────────────────────────
  (a05, 'AXA-2025-033456', 'danos',      'AXA Seguros',  'active',
    225000, '2025-02-01', '2026-12-31',
    'Daños hotel. Incendio, robo, RC establecimiento, pérdida de renta 120 días. Valor inmueble $45M.',
    creator_id, 'anual'),

  (a05, 'HDI-2025-042234', 'rc',         'HDI Seguros',  'active',
    72000,  '2025-01-01', '2026-12-31',
    'RC General establecimiento. Huéspedes y terceros. Daños materiales y lesiones. Límite $8M.',
    creator_id, 'anual'),

  (a05, 'GNP-2025-016789', 'gmm',        'GNP',          'active',
    148000, '2024-10-01', '2026-09-30',
    'GMM empleados hotel. 90 trabajadores entre operativos y administrativos. Plan medio.',
    creator_id, 'anual'),

  (a05, 'ZCH-2023-080001', 'ap',         'Zurich',       'expired',
    38000,  '2023-07-01', '2025-06-30',
    'AP empleados VENCIDA. No renovada. Evaluar si se recontrata o se incorpora al GMM existente.',
    creator_id, 'anual'),

  -- ── a06 Distribuidora Morales (6) ──────────────────────────────────
  (a06, 'GNP-2025-017890', 'danos',      'GNP',          'active',
    155000, '2025-03-01', '2026-12-31',
    'Daños almacenes San Nicolás y Guadalupe. Mercancía en tránsito incluida. Valor $35M.',
    creator_id, 'anual'),

  (a06, 'QLT-2025-063456', 'auto',       'Qualitas',     'active',
    55000,  '2025-01-15', '2026-12-31',
    'Auto flotilla 40 vehículos repartidores. Cobertura amplia. Deducibles bajos negociados.',
    creator_id, 'mensual'),

  (a06, 'SUR-2025-052345', 'transporte', 'Sura',         'active',
    88000,  '2024-12-01', '2026-11-30',
    'Transporte mercancías propias. Distribución regional NL, Coahuila, Tamaulipas.',
    creator_id, 'anual'),

  (a06, 'HDI-2025-043567', 'rc',         'HDI Seguros',  'active',
    48000,  '2025-05-01', '2026-04-30',
    'RC comercial. Daños a clientes y proveedores en instalaciones y entregas. $5M límite.',
    creator_id, 'anual'),

  (a06, 'MLF-2025-022345', 'gmm',        'MetLife',      'active',
    125000, '2025-01-01', '2026-12-31',
    'GMM empleados distribuidora. 180 trabajadores. Plan con red media MTY y área metropolitana.',
    creator_id, 'anual'),

  (a06, 'ZCH-2025-081234', 'ap',         'Zurich',       'active',
    35000,  '2025-02-15', '2026-12-31',
    'AP empleados almacén. Riesgo de trabajo ampliado. $800,000 por evento. Cubre horario nocturno.',
    creator_id, 'anual'),

  -- ── a07 Soft Technology (4) ────────────────────────────────────────
  (a07, 'AXA-2025-034567', 'rc',         'AXA Seguros',  'active',
    95000,  '2025-04-01', '2026-12-31',
    'RC Profesional IT. Errores y omisiones en desarrollo de software y consultoría. $8M límite.',
    creator_id, 'anual'),

  (a07, 'GNP-2025-018901', 'gmm',        'GNP',          'active',
    185000, '2025-01-01', '2026-12-31',
    'GMM empleados. 180 personas. Plan Plus con telemedicina incluida. Cobertura nacional.',
    creator_id, 'anual'),

  (a07, 'MLF-2024-023456', 'vida',       'MetLife',      'active',
    72000,  '2024-08-01', '2026-07-31',
    'Vida grupo líderes y key persons. 30 asegurados. Suma $2,500,000 c/u.',
    creator_id, 'anual'),

  (a07, 'ZCH-2025-082345', 'ap',         'Zurich',       'active',
    28000,  '2025-03-01', '2026-12-31',
    'AP empleados. Accidentes laborales y no laborales. $600,000 por evento. Incluye home office.',
    creator_id, 'anual'),

  -- ── a08 Agrícola Los Pinos (5) ────────────────────────────────────
  (a08, 'GNP-2025-019012', 'danos',      'GNP',          'active',
    235000, '2025-05-01', '2026-04-30',
    'Daños cosechas sorgo y maíz. 850 ha declaradas. Cubre heladas, granizo y sequía extrema.',
    creator_id, 'anual'),

  (a08, 'SUR-2025-053456', 'transporte', 'Sura',         'active',
    65000,  '2025-05-01', '2026-04-30',
    'Transporte cosechas propias. Tránsito Tamaulipas-Monterrey. Valor máx. $5M por viaje.',
    creator_id, 'anual'),

  (a08, 'ZCH-2025-083456', 'ap',         'Zurich',       'active',
    45000,  '2025-01-01', '2026-12-31',
    'AP trabajadores agrícolas de planta y temporales. 95 personas. Incluye traslados.',
    creator_id, 'anual'),

  (a08, 'HDI-2023-044001', 'rc',         'HDI Seguros',  'expired',
    38000,  '2023-01-01', '2024-12-31',
    'RC general VENCIDA. No renovada por cambio de estructura societaria. Retomar contacto.',
    creator_id, 'anual'),

  (a08, 'MPF-2025-090456', 'otro',       'Mapfre',       'active',
    55000,  '2025-05-15', '2026-05-14',
    'Equipo agrícola: tractores, sembradora, rastra. Valor asegurado $18M. Todo riesgo maquinaria.',
    creator_id, 'anual'),

  -- ── a09 Universidad Regional del Norte (6) ────────────────────────
  (a09, 'GNP-2025-020123', 'gmm',        'GNP',          'active',
    195000, '2025-01-01', '2026-12-31',
    'GMM empleados 4 campuses. 450 personas. Plan Plus red amplia. Incluye dental básico.',
    creator_id, 'anual'),

  (a09, 'AXA-2025-035678', 'rc',         'AXA Seguros',  'active',
    85000,  '2025-03-01', '2026-12-31',
    'RC civil universitaria. Daños a alumnos, docentes y terceros en instalaciones. Límite $10M.',
    creator_id, 'anual'),

  (a09, 'HDI-2024-045678', 'danos',      'HDI Seguros',  'active',
    165000, '2024-09-15', '2026-09-14',
    'Daños 4 campus universitarios. Incendio, robo, cristales. Valor declarado $120M.',
    creator_id, 'anual'),

  (a09, 'MLF-2025-024567', 'vida',       'MetLife',      'active',
    92000,  '2025-02-01', '2026-12-31',
    'Vida grupo docentes y personal directivo. 80 asegurados. Suma $2M c/u.',
    creator_id, 'anual'),

  (a09, 'ZCH-2025-084567', 'ap',         'Zurich',       'active',
    35000,  '2025-08-01', '2026-07-31',
    'AP colectivo estudiantil. 3,800 alumnos. Prima por alumno $9.21. Cubre accidentes en campus.',
    creator_id, 'anual'),

  (a09, 'MPF-2025-090789', 'otro',       'Mapfre',       'active',
    28000,  '2025-06-01', '2026-05-31',
    'Equipo deportivo (gimnasio, cancha) y audiovisual (auditorios). Valor $4.5M. Todo riesgo.',
    creator_id, 'anual'),

  -- ── a10 Inmobiliaria Pedregal (6) ─────────────────────────────────
  (a10, 'AXA-2025-036789', 'danos',      'AXA Seguros',  'active',
    385000, '2025-01-01', '2026-12-31',
    'Daños portafolio 22 inmuebles CDMX. Incendio, robo, RC arrendador. Valores declarados actualizados.',
    creator_id, 'anual'),

  (a10, 'HDI-2025-046789', 'rc',         'HDI Seguros',  'active',
    68000,  '2025-01-01', '2026-12-31',
    'RC arrendador. Daños a inquilinos y terceros en propiedades administradas. Límite $8M.',
    creator_id, 'anual'),

  (a10, 'GNP-2024-021234', 'gmm',        'GNP',          'active',
    88000,  '2024-11-01', '2026-10-31',
    'GMM empleados administrativos y de mantenimiento. 35 personas. Plan Plus.',
    creator_id, 'anual'),

  (a10, 'BBV-2025-071234', 'fianzas',    'BBVA Seguros', 'active',
    75000,  '2025-02-01', '2026-12-31',
    'Fianzas de arrendamiento e inmobiliarias para contratos con entidades públicas. Límite $30M.',
    creator_id, 'anual'),

  (a10, 'MLF-2025-025678', 'vida',       'MetLife',      'pending_renewal',
    145000, '2025-04-15', '2026-04-10',
    'Vida socios directivos. 6 asegurados. $5,000,000 c/u. RENOVACIÓN 10 ABRIL — evaluar incremento de suma.',
    creator_id, 'anual'),

  (a10, 'ZCH-2025-085678', 'ap',         'Zurich',       'active',
    32000,  '2025-03-15', '2026-12-31',
    'AP empleados administrativos. $500,000 por evento. Incluye traslados en transporte público.',
    creator_id, 'anual'),

  -- ── a11 Fabricaciones Metálicas Juárez (5) ────────────────────────
  (a11, 'GNP-2025-022345', 'danos',      'GNP',          'active',
    445000, '2025-01-01', '2026-12-31',
    'Daños planta industrial Juárez. Incendio maquinaria, robo, pérdida de utilidades 90 días. Valor $180M.',
    creator_id, 'anual'),

  (a11, 'AXA-2024-037890', 'rc',         'AXA Seguros',  'active',
    125000, '2024-07-01', '2026-06-30',
    'RC industrial. Contaminación, daños a terceros por operaciones fabriles. Límite $15M por evento.',
    creator_id, 'anual'),

  (a11, 'MPF-2025-091234', 'tecnicos',   'Mapfre',       'active',
    88000,  '2025-02-01', '2026-12-31',
    'Riesgos técnicos maquinaria CNC, prensas y equipos de precisión. Valor asegurado $45M. Todo riesgo.',
    creator_id, 'anual'),

  (a11, 'ZCH-2025-086789', 'ap',         'Zurich',       'active',
    55000,  '2025-01-15', '2026-12-31',
    'AP empleados planta 320 trabajadores. Incluye horas extra, turnos nocturnos y traslados.',
    creator_id, 'anual'),

  (a11, 'MLF-2025-026789', 'gmm',        'MetLife',      'active',
    178000, '2025-03-01', '2026-12-31',
    'GMM planta y administración. 320 personas. Plan Medio con red en Cd. Juárez y Chihuahua.',
    creator_id, 'anual'),

  -- ── a12 Restaurantes La Hacienda (4) ──────────────────────────────
  (a12, 'GNP-2025-023456', 'danos',      'GNP',          'active',
    165000, '2025-04-01', '2026-12-31',
    'Daños 7 restaurantes ZMM. Incendio, robo, equipo de cocina, pérdida de renta 60 días.',
    creator_id, 'anual'),

  (a12, 'MLF-2025-027890', 'gmm',        'MetLife',      'active',
    95000,  '2025-01-01', '2026-12-31',
    'GMM empleados de cocina, servicio y administración. 280 personas. Plan Básico.',
    creator_id, 'anual'),

  (a12, 'HDI-2025-047890', 'rc',         'HDI Seguros',  'active',
    45000,  '2025-06-01', '2026-05-31',
    'RC establecimiento. Intoxicación, caídas y daños a comensales. Límite $3M por evento.',
    creator_id, 'anual'),

  (a12, 'ZCH-2023-080002', 'ap',         'Zurich',       'expired',
    28000,  '2023-09-01', '2025-08-31',
    'AP meseros VENCIDA. Evaluar renovación con Sura — cotización pendiente desde noviembre.',
    creator_id, 'anual'),

  -- ── a13 Alejandro García Hernández (4) ────────────────────────────
  (a13, 'GNP-2025-024001', 'gmm',        'GNP',          'active',
    18500,  '2025-02-01', '2026-12-31',
    'GMM familiar Plan Plus. Él, esposa y 2 hijos. Dental incluido. Red amplia Monterrey.',
    creator_id, 'anual'),

  (a13, 'MLF-2024-028001', 'vida',       'MetLife',      'active',
    12000,  '2024-06-01', '2026-05-31',
    'Vida temporal 20 años. Suma $5,000,000. Beneficiaria: esposa Mariana Salinas García 100%.',
    creator_id, 'anual'),

  (a13, 'QLT-2025-064001', 'auto',       'Qualitas',     'active',
    8500,   '2025-08-01', '2026-07-31',
    'Auto BMW X3 2023 placas NLE-123-AB. Cobertura amplia. Sin deducible en robo total.',
    creator_id, 'mensual'),

  (a13, 'AXA-2025-038001', 'danos',      'AXA Seguros',  'active',
    6500,   '2025-01-01', '2026-12-31',
    'Hogar residencia San Pedro GG. Contenidos $800K, estructura $3,500,000. Robo con violencia incluido.',
    creator_id, 'anual'),

  -- ── a14 María del Carmen Flores Torres (4) ────────────────────────
  (a14, 'GNP-2025-024002', 'gmm',        'GNP',          'active',
    16500,  '2025-03-01', '2026-12-31',
    'GMM individual Plan Plus. Cobertura CDMX y foránea. Incluye maternidad y dental.',
    creator_id, 'anual'),

  (a14, 'QLT-2025-064002', 'auto',       'Qualitas',     'active',
    7800,   '2025-01-15', '2026-12-31',
    'Auto Audi Q5 2023 placas CDMX-123-BC. Cobertura amplia. Asistencia vial 24h.',
    creator_id, 'mensual'),

  (a14, 'MLF-2025-028002', 'vida',       'MetLife',      'pending_renewal',
    9500,   '2025-03-20', '2026-03-15',
    'Vida temporal. Suma $3,000,000. RENOVACIÓN 15 MARZO — cotizar también con GNP para comparar.',
    creator_id, 'anual'),

  (a14, 'ZCH-2025-087001', 'ap',         'Zurich',       'active',
    4500,   '2025-04-01', '2026-12-31',
    'AP individual. Invalidez total y parcial. $600,000. Profesión de riesgo: arquitecta de obra.',
    creator_id, 'anual'),

  -- ── a15 Roberto Jiménez Ortega (5) ────────────────────────────────
  (a15, 'MLF-2024-028003', 'vida',       'MetLife',      'active',
    22000,  '2024-09-01', '2026-08-31',
    'Vida universal. Suma $8,000,000. Componente de ahorro incluido. Beneficiaria: esposa Claudia López.',
    creator_id, 'anual'),

  (a15, 'GNP-2025-024003', 'gmm',        'GNP',          'active',
    19500,  '2025-01-01', '2026-12-31',
    'GMM familiar Plan Plus. 4 integrantes: él, esposa y 2 hijos. Red amplia nacional.',
    creator_id, 'anual'),

  (a15, 'QLT-2025-064003', 'auto',       'Qualitas',     'active',
    9200,   '2025-04-01', '2026-05-01',
    'Auto Honda CR-V 2022 placas JAL-234-CD. Cobertura amplia. Asistencia vial incluida.',
    creator_id, 'mensual'),

  (a15, 'ZCH-2025-087002', 'ap',         'Zurich',       'active',
    5500,   '2025-06-01', '2026-05-31',
    'AP individual. Actividades de riesgo incluidas (ciclismo, senderismo). $800,000 cobertura.',
    creator_id, 'anual'),

  (a15, 'AXA-2025-038002', 'danos',      'AXA Seguros',  'active',
    7200,   '2025-01-01', '2026-12-31',
    'Hogar casa residencial Guadalajara. Contenidos $600K, estructura $4,000,000. Todo riesgo.',
    creator_id, 'anual'),

  -- ── a16 Dra. Patricia Sánchez Vega (2 cotizaciones) ───────────────
  (a16, NULL, 'gmm',  'GNP',     'quote',
    14500,  NULL, NULL,
    'Cotización GMM individual Plan Plus. Médico especialista — solicita cobertura sin restricciones por preexistencias.',
    creator_id, NULL),

  (a16, NULL, 'vida', 'MetLife', 'quote',
    8500,   NULL, NULL,
    'Cotización vida temporal 20 años. Suma propuesta $4,000,000. Pendiente examen médico para emisión.',
    creator_id, NULL),

  -- ── a17 Carlos Alberto López Reyes (3) ────────────────────────────
  (a17, 'QLT-2025-064004', 'auto',  'Qualitas', 'active',
    11500,  '2025-07-01', '2026-06-30',
    'Auto Honda Civic 2022 placas NLE-456-EF. Cobertura amplia. Titular frecuente de renta-car.',
    creator_id, 'mensual'),

  (a17, 'GNP-2025-024004', 'gmm',   'GNP',      'active',
    17500,  '2025-01-01', '2026-12-31',
    'GMM familiar Plan Medio. 3 integrantes: él, esposa y 1 hijo. Red amplia Monterrey.',
    creator_id, 'anual'),

  (a17, 'MLF-2024-028004', 'vida',  'MetLife',  'active',
    13500,  '2024-11-01', '2026-10-31',
    'Vida temporal 15 años. Suma $4,500,000. Beneficiaria: esposa Sandra Morales de López.',
    creator_id, 'anual'),

  -- ── a18 Diana Morales Herrera (3) ─────────────────────────────────
  (a18, 'GNP-2025-024005', 'gmm',  'GNP',      'active',
    15500,  '2025-02-01', '2026-12-31',
    'GMM individual Plan Plus. Cobertura CDMX. Dental y visual incluidos.',
    creator_id, 'anual'),

  (a18, 'MLF-2025-028005', 'vida', 'MetLife',  'active',
    10500,  '2025-01-01', '2026-12-31',
    'Vida temporal 20 años. Suma $3,500,000. Cubre hipoteca de departamento en Polanco.',
    creator_id, 'anual'),

  (a18, 'QLT-2025-064005', 'auto', 'Qualitas', 'active',
    8200,   '2025-05-01', '2026-04-30',
    'Auto Toyota RAV4 2021 CDMX. Cobertura amplia. Asistencia vial 24h y auto sustituto.',
    creator_id, 'mensual'),

  -- ── a19 Fernando Ruiz Castillo (5) ────────────────────────────────
  (a19, 'QLT-2025-064006', 'auto',  'Qualitas',     'active',
    12500,  '2025-03-01', '2026-12-31',
    'Auto Toyota Hilux 2022 placas BCN-567-GH Tijuana. Cobertura amplia. Blindaje básico incluido.',
    creator_id, 'mensual'),

  (a19, 'MLF-2025-028006', 'vida',  'MetLife',      'active',
    18500,  '2025-01-01', '2026-12-31',
    'Vida universal. Suma $6,000,000. Componente de ahorro para retiro. Beneficiaria: esposa.',
    creator_id, 'anual'),

  (a19, 'GNP-2024-024006', 'gmm',   'GNP',          'active',
    16500,  '2024-12-01', '2026-11-30',
    'GMM familiar Plan Plus. 3 integrantes. Red amplia norte del país.',
    creator_id, 'anual'),

  (a19, 'ZCH-2025-087003', 'ap',    'Zurich',       'active',
    5800,   '2025-04-01', '2026-12-31',
    'AP individual. $800,000. Cubre actividades de ciclismo de montaña y senderismo extremo.',
    creator_id, 'anual'),

  (a19, 'HDI-2025-048001', 'danos', 'HDI Seguros',  'active',
    7800,   '2025-02-01', '2026-12-31',
    'Hogar Playas de Tijuana. Casa a 200m del mar. Estructura $5M, contenidos $800K. Huracán incluido.',
    creator_id, 'anual'),

  -- ── a20 Dra. Sofía Mendoza Torres (3) ─────────────────────────────
  (a20, 'GNP-2025-024007', 'gmm',  'GNP',      'active',
    14500,  '2025-01-01', '2026-12-31',
    'GMM individual Plan Plus. Odontóloga — cobertura dental de alto nivel sin deducible en especialidades.',
    creator_id, 'anual'),

  (a20, 'MLF-2025-028007', 'vida', 'MetLife',  'active',
    11500,  '2025-03-01', '2026-12-31',
    'Vida temporal. Suma $3,000,000. Beneficiaria por actualizar — pendiente cambio de designación.',
    creator_id, 'anual'),

  (a20, 'QLT-2025-064007', 'auto', 'Qualitas', 'pending_renewal',
    7500,   '2025-04-20', '2026-04-15',
    'Auto VW Tiguan 2022 placas NLE-678-IJ. RENOVACIÓN 15 ABRIL — cotizar descuento por buen historial.',
    creator_id, 'mensual'),

  -- ── a21 Lic. Jorge Ramírez Peña (5) ───────────────────────────────
  (a21, 'QLT-2025-064008', 'auto',  'Qualitas',    'active',
    13500,  '2025-06-01', '2026-05-31',
    'Auto Mercedes GLE 2022 CDMX placas CDMX-890-KL. Cobertura amplia premium. Sin deducible cristales.',
    creator_id, 'mensual'),

  (a21, 'GNP-2025-024008', 'gmm',   'GNP',         'active',
    18000,  '2025-01-01', '2026-12-31',
    'GMM individual y esposa (2 asegurados). Plan Plus Executive con red de hospitales de alto nivel.',
    creator_id, 'anual'),

  (a21, 'MLF-2024-028008', 'vida',  'MetLife',     'active',
    15000,  '2024-08-01', '2026-07-31',
    'Vida universal. Suma $7,000,000. Abogado con exposición patrimonial alta. Beneficiaria: esposa.',
    creator_id, 'anual'),

  (a21, 'ZCH-2023-080003', 'ap',    'Zurich',      'expired',
    4800,   '2023-11-01', '2024-10-31',
    'AP individual VENCIDA. No renovada. Evaluar si desea reactivar o cambiar a Mapfre.',
    creator_id, 'anual'),

  (a21, 'AXA-2025-038003', 'danos', 'AXA Seguros', 'active',
    6800,   '2025-02-15', '2026-12-31',
    'Hogar depto. Lomas de Chapultepec CDMX. Contenidos $1,200,000, estructura $8M. Arte incluido.',
    creator_id, 'anual'),

  -- ── a22 Laura Vidal Montoya (3) ───────────────────────────────────
  (a22, 'GNP-2025-024009', 'gmm',  'GNP',      'active',
    16000,  '2025-04-01', '2026-12-31',
    'GMM individual Plan Plus. Primera póliza con Murguía. Potencial de referir a su empresa.',
    creator_id, 'anual'),

  (a22, 'MLF-2025-028009', 'vida', 'MetLife',  'active',
    12500,  '2025-01-01', '2026-12-31',
    'Vida temporal 20 años. Suma $3,500,000. Beneficiaria: madre Guadalupe Montoya.',
    creator_id, 'anual'),

  (a22, 'QLT-2025-064009', 'auto', 'Qualitas', 'active',
    8800,   '2025-09-01', '2026-08-31',
    'Auto Mazda CX-5 2023 Monterrey. Cobertura amplia. Asistencia vial y cristales sin deducible.',
    creator_id, 'mensual');

END;
$$ LANGUAGE plpgsql;

-- ── Verificación (ejecutar después del seed) ────────────────────────────
-- SELECT 'Cuentas'   AS entidad, COUNT(*)::TEXT AS total FROM accounts  WHERE assigned_to = (SELECT id FROM profiles WHERE email = 'rwilton@murguia.com');
-- SELECT 'Contactos' AS entidad, COUNT(*)::TEXT AS total FROM contacts  WHERE created_by  = (SELECT id FROM profiles WHERE email = 'cmireles@murguia.com');
-- SELECT 'Pólizas'   AS entidad, COUNT(*)::TEXT AS total FROM policies  WHERE created_by  = (SELECT id FROM profiles WHERE email = 'cmireles@murguia.com');
-- SELECT status, COUNT(*) FROM accounts WHERE assigned_to = (SELECT id FROM profiles WHERE email = 'rwilton@murguia.com') GROUP BY status;
-- SELECT status, COUNT(*) FROM policies WHERE created_by  = (SELECT id FROM profiles WHERE email = 'cmireles@murguia.com') GROUP BY status;
