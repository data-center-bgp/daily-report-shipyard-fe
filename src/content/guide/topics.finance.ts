import type { GuideTopic } from "./types";

export const financeTopics: GuideTopic[] = [
  {
    id: "bastp-create",
    title: "Membuat BASTP",
    summary: "Serahterimakan work detail yang selesai dan general services untuk satu kapal.",
    group: "finance",
    roles: ["MASTER", "PPIC", "PRODUCTION", "ADMIN"],
    before:
      "Work detail sudah 100%. Yang belum ditinjau akan disetujui otomatis setelah 2 hari.",
    steps: [
      {
        title: "Buka BASTP lalu tekan Create BASTP",
        detail: "BASTP ada di bawah Finance & Documents.",
      },
      {
        title: "Pilih tanggal BASTP lebih dulu",
        detail:
          "Nomor BASTP terisi sendiri dan terkunci. Bulan dan tahunnya mengikuti tanggal itu.",
      },
      {
        title: "Pilih kapal",
        detail:
          "Anda bisa menemukannya lewat project atau work order. Kapal terkunci setelah work detail ditambahkan.",
      },
      {
        title: "Tambahkan rincian serah terima jika ada",
        detail:
          "Nama dan jabatan penerima, serta tanggal Sandar, Naik Docking, Turun Docking, dan Tambat Setelah Turun Dock. Semuanya hanya dicetak pada BASTP.",
      },
      {
        title: "Tambahkan general services jika ada",
        detail:
          "Layanan harian butuh tanggal mulai dan selesai. Layanan ton seperti Fresh Water Supply butuh satu atau lebih pengiriman dengan tanggal dan kuantitas. Layanan Kali dan Ls butuh kuantitas. Keel Laying dan Launching hanya butuh satu tanggal: tidak ada hari, kuantitas, atau harga, dan keduanya tidak muncul di invoice. Harga layanan lain diisi nanti di invoice.",
      },
      {
        title: "Pindahkan work detail yang diinginkan dari Available ke Selected",
        detail:
          "Hanya work detail yang 100% (atau yang dibatalkan, dengan harga nol) yang ditawarkan. Yang sudah ada di BASTP lain disembunyikan.",
      },
      {
        title: "Simpan",
        detail:
          "BASTP butuh minimal satu work detail, kecuali BASTP itu hanya berisi layanan air tawar.",
      },
    ],
    tips: [
      "Status berubah sendiri: Draft, lalu Verified bila setiap work detail aktif sudah disetujui, lalu Ready for invoice, lalu Invoiced.",
      "Mengubah komposisi work detail pada sebuah BASTP mengembalikannya ke Draft.",
      "Print membuka pratinjau A4 yang bisa dicetak atau diunduh sebagai PDF. Tanda tangan dibubuhkan dengan tulisan tangan.",
    ],
    problems: [
      {
        problem: "Sebuah work detail tidak ada di daftar.",
        fix: "Work detail itu belum 100%, atau sudah ada di BASTP lain.",
      },
      {
        problem: "Muncul pesan bahwa nomor sudah ada.",
        fix: "Pilih tanggal yang berbeda atau edit nomornya.",
      },
    ],
    openIn: { label: "Buka BASTP", href: "/bastp" },
    related: ["bastp-materials", "invoice-create"],
  },
  {
    id: "bastp-materials",
    title: "Submit material dan penawaran agar BASTP siap di-invoice",
    summary: "Material control untuk setiap work detail, lalu PDF Form Penawaran.",
    group: "finance",
    roles: ["MASTER", "PPIC", "PRODUCTION", "ADMIN"],
    before: "BASTP berstatus Draft atau Verified. Setelah itu BASTP terkunci.",
    steps: [
      {
        title: "Buka BASTP lalu tekan Material Control",
        detail: "Halaman itu mendaftar setiap work detail.",
      },
      {
        title: "Tambahkan material yang dipakai pada sebuah work detail",
        detail:
          "Pilih materialnya dan isi kolom yang diminta. Kolomnya bergantung pada mode perhitungan material, seperti luas, dimensi, jumlah, atau panjang pipa.",
      },
      {
        title: "Edit atau hapus material bila perlu",
        detail: "Menghapus meminta konfirmasi.",
      },
      {
        title: "Tekan Submit Materials untuk work detail itu",
        detail:
          "Jika Anda tidak menambahkan apa pun, aplikasi meminta Anda mengonfirmasi bahwa work detail itu tidak butuh material.",
      },
      {
        title: "Kembali dan unggah Form Penawaran",
        detail:
          "Berupa PDF, maksimal 10 MB. Anda bisa melihat atau menggantinya sampai BASTP terkunci.",
      },
      {
        title: "Periksa statusnya",
        detail:
          "Setelah setiap work detail aktif punya material yang sudah di-submit dan PDF sudah diunggah, BASTP menjadi Ready for invoice.",
      },
    ],
    tips: [
      "Work detail yang sudah di-submit hanya bisa diubah lagi lewat Reopen for Editing.",
      "Badge di daftar, Form Penawaran missing, menunjukkan BASTP mana yang masih butuh PDF.",
    ],
    related: ["bastp-create", "invoice-create"],
  },
  {
    id: "invoice-create",
    title: "Membuat invoice",
    summary: "Beri harga pada BASTP yang siap, tambahkan pajak, dan pantau pembayaran.",
    group: "finance",
    roles: ["FINANCE", "MASTER"],
    before: "BASTP berstatus Ready for invoice dan belum di-invoice.",
    steps: [
      {
        title: "Buka Invoices lalu tab Ready for Invoice",
        detail: "Tekan Create Invoice pada baris BASTP.",
      },
      {
        title: "Periksa tanggal invoice",
        detail: "Awalnya terisi hari ini. Nomor invoice terisi sendiri dan terkunci.",
      },
      {
        title: "Isi rinciannya",
        detail:
          "BASTP collection date, company, nomor faktur, due date, delivery date, collection date oleh customer, nama penerima, dan remarks.",
      },
      {
        title: "Isi harga satuan untuk setiap work detail dan general service",
        detail:
          "Jumlah per baris adalah harga satuan dikali kuantitas. Minimal satu harga di atas 0 wajib diisi.",
      },
      {
        title: "Centang Apply PPN (11%) bila pajak berlaku",
        detail:
          "Total = subtotal + PPN − PPh 23. PPN adalah 11% dari subtotal dan opsional. PPh 23 adalah 2% dari subtotal dan selalu berlaku.",
      },
      {
        title: "Tandai sudah dibayar saat customer membayar",
        detail:
          "Centang Mark as Paid dan isi tanggal pembayaran. Ini juga bisa dilakukan nanti dengan mengedit invoice.",
      },
      {
        title: "Simpan",
        detail: "BASTP menjadi Invoiced.",
      },
    ],
    tips: [
      "Invoice yang sudah dibayar mengunci harganya. Hilangkan centang Mark as Paid untuk membukanya.",
      "Nomor invoice ganda ditolak. Nomor kosong dicetak sebagai Draft Invoice.",
      "Menghapus invoice mengembalikan BASTP ke Ready for invoice.",
      "Manager bisa melihat invoice tetapi tidak bisa mengubahnya.",
    ],
    openIn: { label: "Buka Invoices", href: "/invoices" },
    related: ["bastp-create"],
  },
];
