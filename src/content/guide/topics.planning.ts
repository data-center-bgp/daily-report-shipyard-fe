import type { GuideTopic } from "./types";

export const planningTopics: GuideTopic[] = [
  {
    id: "plan-create",
    title: "Membuat docking plan",
    summary: "Rencanakan docking kapal sekitar dua bulan sebelumnya, lengkap dengan work order dan work detail.",
    group: "planning",
    roles: ["SHIPPING", "MASTER"],
    before:
      "Ketahui kapalnya, jenis docking, dan target tanggal docking. Anda mengerjakan plan yang Anda buat sendiri. Master bisa mengerjakan plan milik siapa pun.",
    steps: [
      {
        title: "Buka Docking Plans lalu tekan New plan",
        detail: "Docking Plans ada di bawah Planning pada menu.",
        image: {
          src: "/guide/plans-list.png",
          alt: "Halaman Docking Plans dengan tombol New plan di kanan atas, kotak pencarian, chip status, dan tabel plan dengan kolom Status dan Checked by.",
        },
      },
      {
        title: "Pilih kapal, jenis docking, dan target tanggal",
        detail:
          "Nama plan disarankan dengan pola Kapal - jenis - Bulan Tahun. Anda boleh mengubahnya. Catatan bersifat opsional.",
        image: {
          src: "/guide/plan-new.png",
          alt: "Form New docking plan yang sudah terisi: kapal, jenis docking Docking, target tanggal, dan nama plan yang disarankan, dengan tombol Create plan.",
        },
      },
      {
        title: "Simpan, lalu tambahkan work order",
        detail:
          "Tekan Add work order. Lokasi kerja, nomor WO customer, dan catatan semuanya opsional.",
        image: {
          src: "/guide/plan-detail.png",
          alt: "Halaman sebuah plan berstatus Draft, dengan tombol Submit for review, Import from Excel, dan Add work order, serta work order beserta lima work detail-nya.",
        },
      },
      {
        title: "Tambahkan work detail di bawah work order itu",
        detail:
          "Tekan Add work detail. Wajib diisi: deskripsi, lokasi, work scope, kuantitas (0 atau lebih), dan UOM (Ls, Unit, Pcs, atau Lbr). Tanggal dan catatan bersifat opsional.",
      },
      {
        title: "Ulangi untuk setiap work order dan work detail",
        detail:
          "Pakai Edit untuk mengubah sebuah baris, atau tombol hapus untuk menghapusnya, selama plan masih Draft atau Sent back.",
      },
      {
        title: "Baca daftar di bawah judul halaman",
        detail:
          "Daftar itu menyebutkan apa yang masih kurang sebelum plan bisa di-submit, misalnya work order yang belum punya work detail.",
      },
    ],
    tips: [
      "Plan tidak memuat harga, PIC, nomor SPK, atau nomor permit. PPIC menambahkannya setelah plan menjadi project.",
      "Untuk memasukkan banyak baris sekaligus, pakai Import from Excel.",
    ],
    problems: [
      {
        problem: "Saya tidak bisa mengedit plan saya.",
        fix: "Hanya plan yang Draft atau Sent back yang bisa diedit. Jika statusnya Awaiting review, tunggu PPIC. Plan milik pengguna Shipping lain hanya bisa diedit oleh Master.",
      },
    ],
    openIn: { label: "Buka Docking Plans", href: "/plans" },
    related: ["plan-import", "plan-submit-fix", "plan-follow"],
  },
  {
    id: "plan-import",
    title: "Mengisi plan dari Excel",
    summary: "Tambahkan banyak work order dan work detail ke sebuah plan dengan satu spreadsheet.",
    group: "planning",
    roles: ["SHIPPING", "MASTER"],
    before:
      "Plan berstatus Draft atau Sent back. Pekerjaan yang sudah ada di dalam plan tidak berubah.",
    steps: [
      {
        title: "Buka plan lalu tekan Import from Excel",
        detail: "Tombolnya ada di samping Add work order.",
      },
      {
        title: "Tekan Download template",
        detail:
          "File berisi sheet Work Orders, sheet Work Details, dan sheet Instructions. Location, Work Scope, dan UOM punya dropdown.",
        image: {
          src: "/guide/plan-import-dialog.png",
          alt: "Jendela Import from Excel dengan tombol Download template dan kotak untuk memilih file .xlsx.",
        },
      },
      {
        title: "Isi sheet Work Orders",
        detail:
          "Beri setiap work order sebuah Work Order Ref singkat, misalnya WO-1. Ref ini hanya menghubungkan kedua sheet dan tidak disimpan. Lokasi kerja, nomor WO customer, dan catatan bersifat opsional.",
      },
      {
        title: "Isi sheet Work Details",
        detail:
          "Di kolom pertama, ketik Work Order Ref tempat baris itu berada. Wajib diisi: description, location, work scope, quantity, dan UOM. Tanggal opsional dan ditulis seperti 2027-02-16.",
      },
      {
        title: "Hapus baris contoh",
        detail: "Template diawali baris contoh. Hapus sebelum Anda mengunggah.",
      },
      {
        title: "Pilih file lalu baca hasil pemeriksaan",
        detail:
          "Masalah ditampilkan per sheet dan baris, misalnya Work Details, row 3: Location not found. Perbaiki di Excel lalu pilih file lagi. Tidak ada yang disimpan sebelum file bebas dari masalah.",
        image: {
          src: "/guide/plan-import-ready.png",
          alt: "Jendela Import from Excel setelah file dipilih: pesan hijau bahwa file siap dengan 1 work order dan 5 work detail, dan tombol Import into plan.",
        },
      },
      {
        title: "Tekan Import into plan",
        detail: "Sebuah pesan menyebutkan berapa work order dan work detail yang ditambahkan.",
      },
    ],
    tips: [
      "Work order tanpa work detail hanya menghasilkan peringatan, tetapi plan tidak bisa di-submit sebelum work order itu punya work detail.",
      "Batas: hanya file .xlsx, maksimal 5 MB, 500 baris per sheet.",
      "Pilih lokasi dan scope dari dropdown agar namanya sama persis.",
    ],
    problems: [
      {
        problem: "UOM bukan salah satu dari Ls, Unit, Pcs, Lbr.",
        fix: "Plan hanya menerima keempat satuan itu. Pilih salah satu dari dropdown.",
      },
      {
        problem: "Work Order Ref is not on the Work Orders sheet.",
        fix: "Sebuah work detail menyebut referensi yang tidak dimiliki work order mana pun. Perbaiki ejaannya, atau tambahkan work order-nya.",
      },
    ],
    related: ["plan-create", "plan-submit-fix"],
  },
  {
    id: "plan-submit-fix",
    title: "Submit plan dan memperbaikinya saat dikembalikan",
    summary: "Kirim plan ke PPIC, lalu jawab catatan mereka dan kirim lagi.",
    group: "planning",
    roles: ["SHIPPING", "MASTER"],
    before: "Setiap work order punya minimal satu work detail.",
    steps: [
      {
        title: "Buka plan lalu tekan Submit for review",
        detail:
          "Tombol nonaktif selama masih ada yang kurang. Daftar di bawah judul menyebutkan apa itu. Setelah di-submit, plan terkunci dan statusnya Awaiting review.",
      },
      {
        title: "Tunggu PPIC",
        detail:
          "PPIC menyetujui plan atau mengembalikannya. Anda bisa memantau statusnya di halaman plan dan di daftar Docking Plans.",
      },
      {
        title: "Jika statusnya Sent back, baca catatannya",
        detail:
          "Catatan umum ada di bagian atas. Catatan untuk satu work order atau work detail muncul sebagai tanda pada baris itu.",
        image: {
          src: "/guide/plan-sent-back.png",
          alt: "Halaman plan berstatus Sent back: kotak PPIC sign-off berisi catatan PPIC, lalu work order dan riwayat review di bagian bawah.",
        },
      },
      {
        title: "Perbaiki baris-barisnya",
        detail: "Edit, tambah, atau hapus baris sesuai yang diminta catatan.",
      },
      {
        title: "Submit lagi",
        detail: "Setiap submit diberi nomor. Riwayat menyimpan setiap putaran catatan.",
      },
      {
        title: "Jika sudah Approved, biarkan",
        detail:
          "Plan yang disetujui terkunci. Jika ada yang harus diubah, minta PPIC membukanya kembali dengan alasan. Persetujuan lalu dihapus.",
      },
    ],
    problems: [
      {
        problem: "Tombol Submit for review berwarna abu-abu.",
        fix: "Baca daftar di bawah judul. Tambahkan work order, atau tambahkan work detail pada work order yang belum punya.",
      },
    ],
    related: ["plan-follow", "readiness-fill"],
  },
  {
    id: "plan-review",
    title: "Meninjau docking plan",
    summary: "Setujui plan, atau kembalikan ke Shipping beserta catatan.",
    group: "planning",
    roles: ["PPIC", "MASTER"],
    before:
      "Plan berstatus Awaiting review. Halaman Docking Plans menunjukkan berapa plan yang menunggu Anda. Master bisa meninjau menggantikan PPIC.",
    steps: [
      {
        title: "Buka Docking Plans dan pilih plan yang Awaiting review",
        detail: "Chip Awaiting review menampilkan daftarnya.",
      },
      {
        title: "Baca work order dan work detail-nya",
        detail: "Periksa scope, lokasi, kuantitas, satuan, dan tanggal.",
      },
      {
        title: "Tambahkan catatan pada baris tertentu bila perlu",
        detail:
          "Pakai tombol catatan pada work order atau work detail. Catatan dikirim bersama keputusan Anda.",
      },
      {
        title: "Tekan Review plan",
        detail: "Anda memberi persetujuan sebagai PPIC.",
      },
      {
        title: "Pilih Approve atau Send back",
        detail:
          "Approve langsung membuat plan berstatus Approved. Satu persetujuan PPIC sudah cukup. Send back memerlukan catatan umum atau minimal satu catatan baris.",
      },
    ],
    tips: [
      "HSSE tidak meninjau plan. HSSE menyetujui form kesiapan project setelah plan dikonversi.",
      "Plan yang Anda kembalikan akan kembali ke Anda saat Shipping men-submit-nya lagi, sebagai pengajuan baru bernomor.",
    ],
    problems: [
      {
        problem: "Saya tidak melihat tombol Review plan.",
        fix: "Plan tidak berstatus Awaiting review, atau Anda sudah meninjau pengajuan ini, atau role Anda bukan PPIC atau Master.",
      },
    ],
    openIn: { label: "Buka Docking Plans", href: "/plans" },
    related: ["plan-convert", "plan-follow"],
  },
  {
    id: "plan-convert",
    title: "Mengonversi plan yang disetujui menjadi project",
    summary: "Buat project, work order, dan work detail yang sebenarnya dari plan yang sudah disetujui.",
    group: "planning",
    roles: ["PPIC", "MASTER"],
    before: "Plan berstatus Approved, dan kapal akan segera docking.",
    steps: [
      {
        title: "Buka plan yang disetujui lalu tekan Convert to project",
        detail: "Halaman konversi terbuka dengan isian yang sudah disarankan.",
      },
      {
        title: "Periksa nama project",
        detail: "Nama disarankan dengan format project yang biasa. Anda boleh mengubahnya.",
      },
      {
        title: "Untuk setiap work order, isi tanggal dan Kapro",
        detail:
          "Nomor WO shipyard disarankan berurutan. Isi shipyard WO date dan pilih Kapro (wajib). Customer WO date bersifat opsional.",
      },
      {
        title: "Tekan Convert",
        detail:
          "Project, work order, dan work detail dibuat sekaligus, atau tidak ada yang dibuat bila terjadi kegagalan. Anda langsung masuk ke project yang baru.",
      },
      {
        title: "Lengkapi sisanya pada work detail yang sudah aktif",
        detail:
          "Tambahkan harga, PIC, nomor SPK, dan nomor permit di sana. Lalu pastikan form kesiapan project sudah diisi dan disetujui HSSE.",
      },
    ],
    tips: [
      "Konversi menyalin plan. Sesudahnya plan tetap ada sebagai catatan yang terkunci, dan project yang aktif berdiri sendiri.",
      "Catatan plan dan catatan work order tidak ikut disalin.",
      "Work order baru langsung ada. Pembuatannya tidak menunggu persetujuan form kesiapan HSSE, jadi periksa tag HSSE pada project.",
    ],
    problems: [
      {
        problem: "Setiap work order memerlukan nomor WO shipyard.",
        fix: "Isi nomornya untuk setiap work order di halaman konversi.",
      },
      {
        problem: "Saya perlu mengubah plan setelah disetujui.",
        fix: "Pakai Reopen dengan alasan. Plan kembali ke Draft dan persetujuannya dihapus. Plan yang sudah dikonversi tidak bisa dibuka kembali.",
      },
    ],
    related: ["readiness-fill", "wd-edit"],
  },
  {
    id: "plan-follow",
    title: "Memantau plan dan melihat siapa yang sudah memeriksanya",
    summary: "Membaca status plan serta tag PPIC dan HSSE pada project.",
    group: "planning",
    roles: "all",
    steps: [
      {
        title: "Buka Docking Plans",
        detail: "Semua role bisa melihat plan, tetapi hanya Shipping dan Master yang bisa mengubahnya.",
      },
      {
        title: "Pakai chip status",
        detail:
          "Draft, Awaiting review, Sent back, Approved, dan Converted to project. Angkanya menunjukkan jumlah plan di setiap status.",
      },
      {
        title: "Buka sebuah plan untuk melihat riwayatnya",
        detail:
          "Anda melihat work order, work detail, catatan yang ditulis PPIC, serta setiap pengajuan dan keputusan.",
      },
      {
        title: "Baca kolom Status dan Checked by",
        detail:
          "Status menunjukkan tahap plan. Checked by menunjukkan dua pemeriksaan: PPIC (Not submitted yet, Awaiting review, Sent back, atau Approved) dan HSSE. HSSE baru punya status setelah plan dikonversi, karena HSSE menyetujui form kesiapan project; sebelum itu tertulis After conversion.",
        image: {
          src: "/guide/plans-list.png",
          alt: "Daftar Docking Plans dengan kolom Status dan kolom Checked by yang menunjukkan tag PPIC dan HSSE untuk setiap plan.",
        },
      },
      {
        title: "Buka Projects dan baca kolom Checked by",
        detail:
          "PPIC: Plan approved berarti project berasal dari plan yang sudah disetujui. Not required berarti project dibuat tanpa plan. HSSE menunjukkan status form kesiapan.",
      },
    ],
    tips: [
      "Plan yang sudah dikonversi juga menampilkan kedua tag, sehingga Shipping bisa melihat kapan HSSE sudah menyetujui form kesiapan.",
    ],
    openIn: { label: "Buka Docking Plans", href: "/plans" },
    related: ["plan-review", "readiness-review"],
  },
];
