-- ============================================================================
-- One-time sync of vessel type/company/fleet_number against the company's
-- internal fleet API (response reviewed 2026-07-30). Matching is done by
-- vessel NAME, not id — the API's ids are a separate, unrelated sequence
-- from this app's vessel.id (e.g. the API's "MT RATU RUWAIDAH" is id 1,
-- ours is id 4).
--
-- Cleanup folded into this same migration, all zero-impact on existing
-- work_order/projects/bastp references (verified before writing this):
--   - Typo fix: "AHTS PASIFIC PREMIUM" -> "AHTS PACIFIC PREMIUM" (matches
--     the API's spelling; same vessel, not a rename of a different ship).
--   - Two duplicate rows (id 108 "SPOB ALVINA 03", id 109 "SPOB BBSS 27")
--     are near-spelling duplicates of already-existing vessels (id 76
--     "SPOB ALLVINA 03", id 77 "SPOB BB SS 27") and have zero work_order,
--     projects, or bastp rows referencing them — soft-deleted, not merged
--     (nothing to migrate).
--   - `type` values stored as the literal text "NULL" (not a real NULL) on
--     a handful of rows are cleared first so the sync below can fill them.
--   - SPOB MALELARAJA and SPOB PERKASA INDONESIA ALGARIS move from
--     "Barokah Gemilang Perkasa" to "Barokah Bersaudara Perkasa" — the API
--     lists a distinct company code (BBPERKASA) for these two, confirmed
--     intentional, not a typo.
--
-- Company names are normalized to this app's existing spelling convention
-- rather than copied verbatim from the API (e.g. the API's "Armada Samudra
-- Global" -> this app's existing "Armada Samudera Global").
-- ============================================================================

set search_path to daily_report_shipyard;

-- Typo: same vessel as the API's "AHTS PACIFIC PREMIUM", not a different ship.
update vessel
set name = 'AHTS PACIFIC PREMIUM', updated_at = now()
where upper(trim(name)) = 'AHTS PASIFIC PREMIUM' and deleted_at is null;

-- Duplicate rows with zero references anywhere else — safe to deactivate outright.
update vessel
set deleted_at = now(), updated_at = now()
where id = 108 and upper(trim(name)) = 'SPOB ALVINA 03' and deleted_at is null;

update vessel
set deleted_at = now(), updated_at = now()
where id = 109 and upper(trim(name)) = 'SPOB BBSS 27' and deleted_at is null;

-- "NULL" was stored as literal text on a few rows instead of a real NULL;
-- clear it so the sync below can fill in the API's real value.
update vessel
set type = null, updated_at = now()
where type = 'NULL' and id in (102, 104, 105, 106);

with api_vessels (vessel_name, fleet_number, ship_type, ship_company) as (
  values
    ('MT RATU RUWAIDAH', 1, 'MT', 'Barokah Gemilang Perkasa'),
    ('TB BB 99', 3, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB CENDERAWASIH NUSANTARA', 3, 'TB', 'Bahtera Nusantara Internasional'),
    ('TB DHIRABRATA 90', 5, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB ELANG NUSANTARA', 3, 'TB', 'Bahtera Nusantara Internasional'),
    ('TB MERPATI NUSANTARA', 3, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB PIPIT NUSANTARA', 3, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB PRIBUMI NUSANTARA', 5, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB RAJAWALI NUSANTARA', 4, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB WIRA PRATAMA', 3, 'TB', 'Bahtera Nusantara Internasional'),
    ('TB BHAYANGKARA', 3, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB JALESVEVA', 3, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB KENCANA LAUT', 3, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB LEMBU BUANA II', 4, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB SEA MASTER', 2, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB YUDDY 01', 2, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB ARMADA SAMUDRA 9', 4, 'TB', 'Armada Samudera Global'),
    ('TB GALAXY GEMILANG 9', 7, 'TB', 'Armada Samudera Global'),
    ('TB LOSARI', 4, 'TB', 'Barokah Gemilang Perkasa'),
    ('TB NURI NUSANTARA', 4, 'TB', 'Armada Samudera Global'),
    ('TB PESUT PENDINGIN', 3, 'TB', 'Bahtera Nusantara Internasional'),
    ('TB WIRA SATYA 27', 7, 'TB', 'Armada Samudera Global'),
    ('UB SINGGASANA LAUT', 5, 'UB', 'Barokah Gemilang Perkasa'),
    ('UB ISTANA LAUT', 5, 'UB', 'Barokah Gemilang Perkasa'),
    ('UB PRINCE BORNEO', 5, 'UB', 'Armada Samudera Global'),
    ('UB KEN AROK 9', 5, 'UB', 'Bahtera Nusantara Internasional'),
    ('UB ROYAL KING ALI', 5, 'UB', 'Barokah Gemilang Perkasa'),
    ('UB SULTAN KHAIDIR', 5, 'UB', 'Barokah Gemilang Perkasa'),
    ('AHT SETIA SATRIA', 5, 'UB', 'Bahtera Nusantara Internasional'),
    ('DSV GARUDA OFFSHORE', 7, 'DSV', 'Armada Samudera Global'),
    ('UB PRABU', 5, 'UB', 'Armada Samudera Global'),
    ('AHT SKA AQUATIC CONSERVER', 7, 'AHT', 'Barokah Gemilang Perkasa'),
    ('AHT ROYAL KING SULAIMAN', 7, 'AHT', 'Bahtera Nusantara Internasional'),
    ('DSV SETIA GAGAH', 7, 'DSV', 'Barokah Gemilang Perkasa'),
    ('AHT SHINE', 7, 'AHT', 'Barokah Gemilang Perkasa'),
    ('AHTS RADEN RAHADI', 7, 'AHTS', 'Barokah Gemilang Perkasa'),
    ('AHTS RADEN RANGGAWUNI', 7, 'AHTS', 'Barokah Gemilang Perkasa'),
    ('AHTS PACIFIC PREMIUM', 7, 'AHTS', 'Barokah Gemilang Perkasa'),
    ('AHTS SETIA TANGKAS', 7, 'AHTS', 'Barokah Gemilang Perkasa'),
    ('AHTS RADEN RAJASWA', 7, 'AHTS', 'Barokah Gemilang Perkasa'),
    ('AHTS RADEN WIJAYA', 7, 'AHTS', 'Barokah Gemilang Perkasa'),
    ('SPCB MAHAKAM MULAWARMAN', 7, 'SPCB', 'Barokah Gemilang Perkasa'),
    ('MT RATU RENGGANIS', 1, 'MT', 'Armada Samudera Global'),
    ('MT GAS GEMILANG', 2, 'MT GAS', 'Armada Samudera Global'),
    ('MT GAS GEMILANG 99', 2, 'MT GAS', 'Bahtera Nusantara Internasional'),
    ('MT QUEEN QADARIAH', 1, 'MT', 'Barokah Gemilang Perkasa'),
    ('MT RATU RAISYA', 1, 'MT', 'Armada Samudera Global'),
    ('MT GRACE V', 2, 'MT GAS', 'Armada Samudera Global'),
    ('MT RATU ZAINAB', 1, 'MT', 'Bahtera Nusantara Internasional'),
    ('MT SULTAN ZULKARNAEN', 2, 'MT', 'Bahtera Nusantara Internasional'),
    ('MT SULTAN ABDURRAHMAN', 4, 'MT', 'Armada Samudera Global'),
    ('MT M PATRICIA', 1, 'MT', 'Barokah Gemilang Perkasa'),
    ('CB NAUTIKA NUSANTARA', 7, 'CB', 'Barokah Gemilang Perkasa'),
    ('OB GEMILANG PERKASA 99', 2, 'OB', 'Barokah Gemilang Perkasa'),
    ('OB KENDEDES', 4, 'OB', 'Barokah Gemilang Perkasa'),
    ('SPOB KERATON', 3, 'OB', 'Barokah Gemilang Perkasa'),
    ('OB RATU INTAN', 3, 'OB', 'Bahtera Nusantara Internasional'),
    ('OB RATU MALIKA', 4, 'OB', 'Bahtera Nusantara Internasional'),
    ('OB ROYAL 45', 3, 'OB', 'Barokah Gemilang Perkasa'),
    ('OB SEA ROYAL 9', 4, 'OB', 'Barokah Gemilang Perkasa'),
    ('OB BB SAS 9', 3, 'OB', 'Barokah Gemilang Perkasa'),
    ('OB PATIH GAJAH MADA', 2, 'OB', 'Barokah Gemilang Perkasa'),
    ('OB PGM 1', 4, 'OB', 'Armada Samudera Global'),
    ('OB QUEEN SOFIA', 4, 'OB', 'Barokah Gemilang Perkasa'),
    ('OB RATU JUWITA', 3, 'OB', 'Barokah Gemilang Perkasa'),
    ('OB SEA ROYAL 36', 3, 'OB', 'Barokah Gemilang Perkasa'),
    ('OB RATU SYAHRAH', 3, 'OB', 'Armada Samudera Global'),
    ('OB GEMILANG PERKASA 9', 3, 'OB', 'Armada Samudera Global'),
    ('SPOB SYAHRAH SAVITRI', 4, 'SPOB', 'Armada Samudera Global'),
    ('SPOB BORNEO PERKASA', 1, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB RATU YAMANI', 2, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('FMP SETIA AMAN 9', 7, 'FMP', 'Barokah Gemilang Perkasa'),
    ('SPOB ALLVINA 03', 6, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB BB SS 27', 6, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB KERTABUMI', 4, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB SULTAN SAMUDRA', 5, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB KENCANA KUMALA', 6, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB KERTABUANA', 1, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB KERTANEGARA', 1, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB MALELARAJA', 6, 'SPOB', 'Barokah Bersaudara Perkasa'),
    ('SPOB PERKASA INDONESIA ALGARIS', 6, 'SPOB', 'Barokah Bersaudara Perkasa'),
    ('SPOB SEA ROYAL 18', 2, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB SEA ROYAL 27', 2, 'SPOB', 'Armada Samudera Global'),
    ('SPOB SUKSES JAYA 1', 6, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB SULTAN SULAIMAN', 6, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB ANINDHITA 81', 4, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB CHEETAH 9', 6, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB ENERGY 01', 6, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('OB RATU SAPHIRE', 4, 'OB', 'Bahtera Nusantara Internasional'),
    ('SPOB GOLDEN PUMA', 6, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB KAISAR', 1, 'SPOB', 'Bahtera Nusantara Internasional'),
    ('OB RATU MARYAM', 4, 'OB', 'Bahtera Nusantara Internasional'),
    ('SPOB MAHAKAM PERKASA 9', 6, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('SPOB SKK 9', 6, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('TB PARDIPTA 05', 4, 'TB', 'Barokah Gemilang Perkasa'),
    ('SPOB KERTAJAYA', 4, 'SPOB', 'Barokah Gemilang Perkasa'),
    ('CB Cemerlang 9', 3, null, null),
    ('HT SAMALAJU JAYA', 3, 'HT', 'Barokah Gemilang Perkasa'),
    ('HT KIDURONG JAYA', 3, 'HT', 'Barokah Gemilang Perkasa'),
    ('TB TRAWANG TUNGGA', 4, 'TB', 'Barokah Gemilang Perkasa')
)
update vessel v
set
  fleet_number = a.fleet_number,
  type = coalesce(a.ship_type, v.type),
  company = coalesce(a.ship_company, v.company),
  updated_at = now()
from api_vessels a
where upper(trim(v.name)) = upper(trim(a.vessel_name))
  and v.deleted_at is null;

-- Genuinely new vessel — no existing row matches this name.
insert into vessel (name, type, company, fleet_number, created_at, updated_at)
select 'TB MUTIARA MARITIM', null, null, 4, now(), now()
where not exists (
  select 1 from vessel where upper(trim(name)) = 'TB MUTIARA MARITIM' and deleted_at is null
);
