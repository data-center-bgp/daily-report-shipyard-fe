import type { GuideTopic } from "./types";

export const workTopics: GuideTopic[] = [
  {
    id: "wo-create",
    title: "Membuat work order",
    summary: "Tambahkan original work order ke sebuah project.",
    group: "work",
    roles: ["MASTER", "PPIC", "PRODUCTION", "ADMIN", "ADMIN_SHIPPING"],
    before:
      "Project sudah ada dan form kesiapannya berstatus Approved. Original work order tidak bisa dibuat sebelum itu.",
    steps: [
      {
        title: "Buka Work Orders lalu tekan Add Work Order",
        detail:
          "Anda juga bisa menekan Add work order di halaman project, yang langsung memilihkan project-nya.",
      },
      {
        title: "Pilih project",
        detail:
          "Atau tekan New Project untuk membuatnya saat itu juga. Pilih work type lebih dulu, karena project baru menyalinnya sebagai jenis docking.",
      },
      {
        title: "Pilih Shipyard WO Date",
        detail:
          "Shipyard WO Number terisi sendiri dan terkunci. Bulan dan tahunnya mengikuti tanggal yang Anda pilih, bukan hari ini.",
      },
      {
        title: "Pilih Kapro",
        detail: "Kolom ini wajib.",
      },
      {
        title: "Isi kolom opsional",
        detail:
          "Work type, work location (Pulau Atas, Pendingin, atau Other), serta nomor dan tanggal WO customer.",
      },
      {
        title: "Tekan Create Work Order",
        detail: "Anda kembali ke halaman project.",
      },
    ],
    tips: [
      "Untuk mengubah nomor WO nanti, pakai Edit work order.",
      "Menghapus work order juga menghapus work detail-nya, jadi konfirmasinya menyebutkan jumlahnya.",
      "Setiap work order bisa dicetak sebagai Work Order (Perintah Kerja) atau Kick Off Meeting, dalam bentuk PDF.",
    ],
    problems: [
      {
        problem: "Muncul peringatan bahwa form kesiapan belum disetujui.",
        fix: "Tekan Go to Readiness Form. HSSE harus menyetujuinya sebelum original work order bisa dibuat.",
      },
      {
        problem: "Kotak Additional Work Order berwarna abu-abu.",
        fix: "Project belum punya original work order.",
      },
    ],
    openIn: { label: "Buka Work Orders", href: "/work-orders" },
    related: ["wo-additional-request", "wd-add"],
  },
  {
    id: "wo-additional-request",
    title: "Menambah additional work order",
    summary: "Pekerjaan tambahan setelah original work order, dengan persetujuan Operation Head.",
    group: "work",
    roles: ["MASTER", "PPIC", "PRODUCTION", "ADMIN", "ADMIN_SHIPPING"],
    before: "Project sudah punya original work order.",
    steps: [
      {
        title: "Buka Add Work Order lalu centang Additional Work Order",
        detail: "Kotak ini baru bisa dipakai bila project sudah punya original work order.",
      },
      {
        title: "Tulis alasannya lalu tekan Request Operation Head approval",
        detail: "Form lalu menampilkan Waiting for Operation Head approval.",
      },
      {
        title: "Tunggu keputusannya",
        detail:
          "Jika disetujui, muncul pesan hijau. Jika ditolak, catatannya ditampilkan dan Anda bisa mengajukan lagi.",
      },
      {
        title: "Isi work order dan buat",
        detail:
          "Tombol Create tetap nonaktif sampai permintaan disetujui. Satu persetujuan dipakai untuk tepat satu work order.",
      },
    ],
    tips: [
      "Chairman Directive adalah jalur lain: centang lalu jelaskan. Permintaan langsung disetujui dan tidak ada yang meninjau, tetapi tetap dicatat untuk pemantauan.",
      "Additional work order tidak menggeser deadline project. Muncul peringatan bila ada yang berjalan lebih lambat.",
    ],
    related: ["wo-additional-approve", "wo-create"],
  },
  {
    id: "wo-additional-approve",
    title: "Menyetujui atau menolak permintaan additional work order",
    summary: "Putuskan apakah pekerjaan tambahan boleh ditambahkan ke sebuah project.",
    group: "work",
    roles: ["OP_HEAD", "MASTER"],
    steps: [
      {
        title: "Buka Additional WO Approvals",
        detail: "Menu ini ada di bawah Approvals & Review. Tampilan bawaannya adalah Pending.",
      },
      {
        title: "Baca permintaannya",
        detail: "Kartu menunjukkan project, kapal, siapa yang meminta, kapan, dan alasannya.",
      },
      {
        title: "Tekan Review",
        detail: "Sebuah kotak terbuka untuk catatan keputusan Anda.",
      },
      {
        title: "Approve atau Reject",
        detail:
          "Catatan opsional saat menyetujui dan wajib saat menolak. Pemohon lalu melihat keputusan Anda.",
      },
    ],
    tips: [
      "Permintaan bertanda Chairman Directive sudah disetujui. Hanya ditampilkan untuk pemantauan.",
      "Pakai filter Approved, Rejected, dan All untuk melihat yang sudah lalu.",
    ],
    openIn: { label: "Buka Additional WO Approvals", href: "/additional-wo-approvals" },
    related: ["wo-additional-request"],
  },
  {
    id: "wd-add",
    title: "Menambah work detail",
    summary: "Daftarkan tugas-tugas sebuah work order, beberapa baris sekaligus.",
    group: "work",
    roles: ["PPIC", "MASTER", "ADMIN_SHIPPING"],
    before: "Work order sudah ada.",
    steps: [
      {
        title: "Buka Work Details lalu tekan Add Work Details",
        detail: "Anda juga bisa mulai dari sebuah work order, yang langsung memilihkannya.",
      },
      {
        title: "Pilih work order",
        detail: "Cari berdasarkan nomor WO, nomor WO customer, atau nama kapal.",
      },
      {
        title: "Isi satu baris untuk setiap tugas",
        detail:
          "Wajib: description, location, work scope, quantity lebih dari 0, UOM (Ls, Unit, Pcs, Lbr), planned start date, target close date (tidak sebelum start), dan period close target.",
      },
      {
        title: "Periksa period close target",
        detail: "Isinya bulan, Januari sampai Desember, disarankan dari bulan target close date.",
      },
      {
        title: "Isi harga jika Anda PPIC atau Master",
        detail: "Harga dalam IDR bersifat opsional dan hanya terlihat oleh PPIC dan Master.",
      },
      {
        title: "Pakai Add row untuk tugas lain, lalu simpan",
        detail: "Minimal satu baris harus tersisa.",
      },
    ],
    tips: [
      "Admin Shipping boleh mengosongkan ketiga kolom tanggal. PPIC melengkapinya nanti lewat Edit.",
      "Centang Is Additional Work Order Details untuk tugas yang ditambahkan setelah scope awal.",
    ],
    openIn: { label: "Buka Work Details", href: "/work-details" },
    related: ["wd-edit", "progress-report"],
  },
  {
    id: "wd-edit",
    title: "Mengedit, membatalkan, atau menghapus work detail",
    summary: "PPIC mengubah rencana sebuah tugas, Production mengisi bagaimana tugas itu dikerjakan.",
    group: "work",
    roles: ["PPIC", "PRODUCTION", "MASTER"],
    steps: [
      {
        title: "Temukan work detail-nya",
        detail:
          "Pakai filter di Work Details (kapal, project, work order, scope, lokasi) atau kotak pencarian.",
      },
      {
        title: "Buka Edit",
        detail: "Kolom yang Anda lihat bergantung pada role Anda.",
      },
      {
        title: "PPIC: ubah kolom perencanaan",
        detail:
          "Description, location, scope, quantity, UOM, tanda additional, planned start, target close, period close target, dan harga.",
      },
      {
        title: "Production: ubah kolom pelaksanaan",
        detail:
          "PIC, nomor SPK, nomor SPKK, file izin kerja, nomor PTW, catatan, actual start, dan actual close (tidak sebelum actual start).",
      },
      {
        title: "Simpan",
        detail: "Master bisa mengubah kedua kelompok kolom.",
      },
    ],
    tips: [
      "Cancel mengeluarkan work detail dari progres dan verifikasi. Work detail itu tetap bisa masuk BASTP dengan harga nol. Uncancel mengembalikannya.",
      "Delete adalah soft delete dan meminta konfirmasi.",
      "Manager, HSSE, dan Operation Head tidak bisa mengedit.",
    ],
    problems: [
      {
        problem: "Saya tidak melihat harga.",
        fix: "Hanya PPIC dan Master yang bisa melihat atau mengubah harga.",
      },
    ],
    openIn: { label: "Buka Work Details", href: "/work-details" },
    related: ["wd-add", "progress-report"],
  },
  {
    id: "progress-report",
    title: "Melaporkan progres sebuah work detail",
    summary: "Catat sudah sejauh mana sebuah tugas, dengan foto opsional.",
    group: "work",
    roles: ["PRODUCTION", "MASTER"],
    steps: [
      {
        title: "Buka Work Progress lalu tekan Add Progress Report",
        detail:
          "Anda juga bisa menekan Add Progress pada sebuah work detail, yang langsung memilihkannya.",
      },
      {
        title: "Pilih work order, lalu work detail",
        detail:
          "Work detail yang sudah 100% disembunyikan, kecuali yang dikembalikan untuk dikerjakan ulang.",
      },
      {
        title: "Isi persentase",
        detail:
          "Dari 0 sampai 100. Pakai koma untuk desimal. Titik otomatis diubah menjadi koma.",
      },
      {
        title: "Periksa tanggal laporan",
        detail: "Awalnya terisi hari ini.",
      },
      {
        title: "Tambahkan catatan dan foto jika ada",
        detail: "Foto bisa JPEG, PNG, GIF, atau WebP, maksimal 10 MB.",
      },
      {
        title: "Simpan",
        detail: "Pada 100%, work detail masuk ke Operation Head untuk diverifikasi.",
      },
    ],
    tips: [
      "Laporan baru tidak boleh lebih rendah dari progres saat ini. Jika Anda salah, edit laporan yang sudah ada.",
      "Laporan tidak bisa ditambah setelah work detail mencapai 100%, kecuali work detail itu dikembalikan untuk dikerjakan ulang. Setelah diminta kerja ulang, laporan baru pertama boleh dimulai lebih rendah.",
      "Work detail yang dibatalkan tidak bisa diberi progres.",
      "Laporan progres tidak bisa dihapus. Edit saja.",
    ],
    problems: [
      {
        problem: "Muncul pesan bahwa progres tidak boleh lebih rendah dari progres saat ini.",
        fix: "Edit laporan terbaru, jangan menambah laporan baru.",
      },
      {
        problem: "Saya tidak menemukan work detail saya.",
        fix: "Kemungkinan sudah 100%, atau dibatalkan.",
      },
    ],
    openIn: { label: "Buka Work Progress", href: "/work-progress" },
    related: ["verify-work"],
  },
  {
    id: "verify-work",
    title: "Memverifikasi pekerjaan yang selesai",
    summary: "Setujui pekerjaan yang mencapai 100%, atau kembalikan untuk dikerjakan ulang.",
    group: "work",
    roles: ["OP_HEAD", "MASTER"],
    before: "Work detail yang mencapai 100% muncul di Pending Review.",
    steps: [
      {
        title: "Buka Work Verification",
        detail: "Menu ini ada di bawah Approvals & Review.",
      },
      {
        title: "Pilih tab",
        detail:
          "Pending Review, Pending Review with BASTP, Needs Rework, atau Verified. Filter berdasarkan kapal, project, atau work order.",
      },
      {
        title: "Buka sebuah item dan baca riwayatnya",
        detail: "Review dan progres sebelumnya ditampilkan.",
      },
      {
        title: "Atur review date",
        detail: "Tidak boleh di masa depan.",
      },
      {
        title: "Tulis catatan",
        detail: "Maksimal 500 karakter. Opsional saat menyetujui, wajib saat mengembalikan.",
      },
      {
        title: "Tekan Approve atau Send Back for Rework",
        detail:
          "Item yang disetujui siap untuk BASTP. Item yang dikembalikan menunggu laporan progres baru, lalu kembali ke Pending Review.",
      },
    ],
    tips: [
      "Jika tidak ada yang meninjau sebuah item, item itu disetujui otomatis 2 hari setelah laporan progres terakhirnya. Ini terjadi saat seseorang yang berhak meninjau membuka halaman ini.",
      "Item yang disetujui otomatis diberi label Auto-approved (2-day deadline).",
      "Work detail yang dibatalkan tidak pernah muncul di sini.",
    ],
    openIn: { label: "Buka Work Verification", href: "/work-verification" },
    related: ["bastp-create"],
  },
];
