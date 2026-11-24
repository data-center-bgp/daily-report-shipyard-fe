import type { GuideTopic } from "./types";

export const dataTopics: GuideTopic[] = [
  {
    id: "import-data",
    title: "Impor work order, work detail, atau progres",
    summary: "Buat banyak data sekaligus dari sebuah spreadsheet.",
    group: "data",
    roles: ["PPIC", "MASTER", "ADMIN_SHIPPING"],
    before:
      "Impor work progress hanya untuk PPIC dan Master. Untuk mengimpor ke sebuah docking plan, pakai Import from Excel pada plan itu.",
    steps: [
      {
        title: "Buka Import Data dan pilih tab",
        detail: "Work Orders, Work Details, atau Work Progress.",
      },
      {
        title: "Unduh template",
        detail:
          "Template Excel gabungan mencakup Work Orders dan Work Details, dengan dropdown dan sheet Instructions. Jangan ubah judul kolom di baris 1.",
      },
      {
        title: "Isi template",
        detail:
          "Tanggal ditulis seperti 2026-11-24. Nama kapal, lokasi, work scope, dan Kapro harus sama dengan yang ada di sistem.",
      },
      {
        title: "Unggah file",
        detail: "CSV, XLSX, dan XLS diterima.",
      },
      {
        title: "Baca pratinjau",
        detail:
          "Anda melihat berapa baris yang valid dan berapa yang tidak. Baris yang tidak valid dilewati dan disertai alasannya.",
      },
      {
        title: "Tekan Import",
        detail: "Baris yang valid disimpan dan impor dicatat di Activity Log.",
      },
    ],
    tips: [
      "File gabungan mengisi tab Work Orders dan Work Details sekaligus. Impor masing-masing di tabnya sendiri, work order lebih dulu.",
      "Work detail boleh menyebut work order yang ada di file yang sama.",
      "Work progress menyimpan satu baris hasil impor per item pekerjaan. Mengunggah lagi akan memperbaruinya, dan baris yang lebih lama dari yang tersimpan dilewati.",
      "Baris contoh sengaja memakai teks pengganti. Ganti sebelum Anda mengimpor.",
    ],
    problems: [
      {
        problem: "Tombol Import nonaktif.",
        fix: "Tidak ada baris yang valid. Baca alasannya di pratinjau lalu perbaiki file.",
      },
      {
        problem: "Saya melihat Import Data tetapi muncul pesan saya tidak boleh mengimpor.",
        fix: "Hanya PPIC, Master, dan Admin Shipping yang bisa mengimpor.",
      },
    ],
    openIn: { label: "Buka Import Data", href: "/import-data" },
    related: ["export-data"],
  },
  {
    id: "export-data",
    title: "Ekspor data",
    summary: "Unduh data kapal sebagai file yang bisa dibuka di Excel.",
    group: "data",
    roles: ["MASTER", "PPIC", "PRODUCTION", "OP_HEAD", "ADMIN", "MANAGER"],
    steps: [
      {
        title: "Buka Export Data",
        detail: "Menu ini ada di bawah Data Tools.",
      },
      {
        title: "Cari dan centang kapal yang Anda inginkan",
        detail: "Jika tidak ada yang dicentang, semua kapal diekspor.",
      },
      {
        title: "Tekan Export",
        detail:
          "Anda mendapat satu file CSV dengan satu baris per laporan progres, bersama work order, work detail, verifikasi, BASTP, dan invoice-nya.",
      },
    ],
    tips: [
      "Harga dan total invoice hanya disertakan untuk Master, Finance, dan Manager.",
      "Harga PPIC hanya disertakan untuk Master dan PPIC.",
      "Jika tidak ada yang bisa diekspor, halaman menyatakannya.",
    ],
    openIn: { label: "Buka Export Data", href: "/export-data" },
    related: ["import-data"],
  },
];
