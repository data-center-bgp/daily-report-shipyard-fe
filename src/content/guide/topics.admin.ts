import type { GuideTopic } from "./types";

export const adminTopics: GuideTopic[] = [
  {
    id: "master-data",
    title: "Mengelola kapal, lokasi, dan work scope",
    summary: "Jaga daftar yang dipakai oleh setiap dropdown di sistem.",
    group: "admin",
    roles: ["MASTER", "PPIC"],
    steps: [
      {
        title: "Buka Master Data",
        detail: "Menu ini ada di bawah Administration. Tab: Vessels, Locations, Work Scopes.",
      },
      {
        title: "Tambahkan sebuah entri",
        detail:
          "Kapal butuh nama dan bisa punya tipe, perusahaan, fleet, dan fleet number. Lokasi atau work scope berupa satu teks wajib. Nama ganda di antara entri aktif ditolak.",
      },
      {
        title: "Edit sebuah entri",
        detail: "Buka, ubah, lalu simpan.",
      },
      {
        title: "Hapus entri yang sudah tidak dipakai",
        detail:
          "Remove adalah soft delete. Entri menjadi Inactive dan hilang dari pilihan baru. Work detail yang sudah ada tetap memakainya.",
      },
      {
        title: "Pulihkan sebuah entri",
        detail: "Ubah filter ke Inactive only atau All, lalu tekan Restore.",
      },
    ],
    tips: [
      "Kapal tanpa fleet number dianggap di luar armada perusahaan sendiri.",
      "Manager bisa melihat tetapi tidak bisa mengubah.",
    ],
    openIn: { label: "Buka Master Data", href: "/master-data" },
  },
  {
    id: "user-manage",
    title: "Mengelola pengguna dan role",
    summary: "Beri seseorang sebuah role, ubah role-nya, atau nonaktifkan akunnya.",
    group: "admin",
    roles: ["MASTER"],
    steps: [
      {
        title: "Buka User Management",
        detail:
          "Menu ini ada di bawah Administration. Cari berdasarkan nama atau email, atau filter berdasarkan role dan status.",
      },
      {
        title: "Ubah role",
        detail:
          "Pilih role baru pada baris pengguna lalu konfirmasi. Agar seseorang bisa merencanakan docking, pilih Shipping.",
      },
      {
        title: "Nonaktifkan pengguna yang tidak boleh punya akses",
        detail:
          "Mereka kehilangan akses sampai Anda mengaktifkannya kembali. Mengaktifkan kembali memulihkan role sebelumnya.",
      },
      {
        title: "Lihat Activity Log bila butuh catatan",
        detail: "Perubahan role dan penonaktifan dicatat.",
      },
    ],
    tips: [
      "Anda tidak bisa menonaktifkan diri sendiri, dan tidak bisa memindahkan role Anda sendiri dari Master. Pengguna Master lain yang harus melakukannya.",
      "Pembuatan akun dan reset password tidak dilakukan di halaman ini.",
      "Manager bisa melihat halaman ini tetapi tidak bisa mengubah apa pun.",
    ],
    openIn: { label: "Buka User Management", href: "/user-management" },
  },
  {
    id: "activity-log",
    title: "Membaca activity log",
    summary: "Lihat siapa melakukan apa, dan kapan.",
    group: "admin",
    roles: "all",
    steps: [
      {
        title: "Buka Activity Logs",
        detail: "Menu ini ada di bawah Administration dan terbuka untuk semua role.",
      },
      {
        title: "Pilih periode",
        detail:
          "7 hari, 14 hari, 30 hari, Bulan Ini (bawaan), panah untuk berpindah, atau rentang khusus dengan Dari dan Sampai, lalu Terapkan.",
      },
      {
        title: "Pakai tab-tabnya",
        detail:
          "Dashboard menampilkan total dan grafik harian. Per User menampilkan setiap orang. Rincian mendaftar setiap aksi, dengan pencarian serta filter aksi dan tabel.",
      },
      {
        title: "Buka sebuah baris untuk rinciannya",
        detail:
          "Rincian memuat pengguna, record, nilai lama dan baru, waktu, alamat IP, dan browser.",
      },
    ],
    tips: [
      "Master dan Manager melihat semua pengguna. Role lain melihat cakupan yang lebih sempit.",
      "Halaman ini sebagian besar berbahasa Indonesia.",
      "Hanya aksi yang dilakukan lewat aplikasi yang tercatat.",
    ],
    openIn: { label: "Buka Activity Logs", href: "/activity-logs" },
  },
];
