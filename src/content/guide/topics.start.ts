import type { GuideTopic } from "./types";

export const startTopics: GuideTopic[] = [
  {
    id: "sign-in-and-menu",
    title: "Masuk dan mengenal menu",
    summary: "Cara login, memakai menu, serta fungsi bel dan sidebar.",
    group: "start",
    roles: "all",
    steps: [
      {
        title: "Buka website lalu masuk",
        detail:
          "Ketik email dan password Anda. Ikon mata menampilkan atau menyembunyikan password. Tidak ada pendaftaran sendiri dan tidak ada tautan lupa password, jadi minta bantuan administrator jika Anda belum punya akun atau lupa password.",
        image: {
          src: "/guide/sign-in.png",
          alt: "Halaman masuk: kolom Email Address dan Password di sisi kanan, dengan tombol biru Sign In di bawahnya.",
        },
      },
      {
        title: "Lihat halaman tujuan Anda",
        detail:
          "Anda diarahkan ke halaman yang Anda minta, atau ke Dashboard. Shipping langsung masuk ke Docking Plans.",
      },
      {
        title: "Pakai menu di sebelah kiri",
        detail:
          "Menu dikelompokkan: Planning, Operations, New Building, Approvals & Review, Finance & Documents, Data Tools, Administration, Bantuan. Anda hanya melihat menu yang boleh dibuka oleh role Anda. Di HP atau jendela sempit, tekan Menu untuk membukanya.",
        image: {
          src: "/guide/menu-shipping.png",
          alt: "Menu di sebelah kiri untuk role Shipping: Dashboard, Docking Plans, Projects, Work Orders, Work Details, Work Progress, Additional WO Approvals, Work Verification, BASTP, Export Data, dan Import Data.",
        },
      },
      {
        title: "Ciutkan sidebar jika ingin ruang lebih luas",
        detail: "Pakai panah di bagian bawah sidebar. Pilihan Anda diingat oleh aplikasi.",
      },
      {
        title: "Perhatikan bel",
        detail:
          "Bel di bagian atas menunjukkan jumlah alert yang aktif. Tekan bel untuk membuka halaman Alerts.",
      },
      {
        title: "Keluar setelah selesai",
        detail: "Tekan tombol merah Logout di kanan atas.",
      },
    ],
    tips: [
      "Tidak ada pencarian untuk seluruh website. Setiap daftar punya kotak pencariannya sendiri.",
      "Tekan Tab sekali di halaman mana pun untuk memunculkan tautan Skip to main content.",
      "Tekan Escape untuk menutup jendela pop-up.",
    ],
    problems: [
      {
        problem: "Muncul tulisan Access denied setelah saya masuk.",
        fix: "Akun Anda dinonaktifkan atau tidak punya profil. Minta pengguna Master untuk memeriksanya.",
      },
      {
        problem: "Rekan saya punya menu yang tidak saya lihat.",
        fix: "Menu mengikuti role. Tanyakan ke pengguna Master jika role Anda seharusnya punya menu itu.",
      },
      {
        problem: "Saya mengetik alamat halaman, tetapi malah masuk ke halaman utama.",
        fix: "Role Anda tidak boleh membuka halaman itu, sehingga aplikasi mengarahkan Anda ke halaman utama.",
      },
    ],
    related: ["alerts-and-dashboard"],
  },
  {
    id: "alerts-and-dashboard",
    title: "Membaca dashboard dan alert",
    summary: "Lihat apa yang perlu perhatian, perkembangan pekerjaan, dan apa yang menunggu untuk ditagih.",
    group: "start",
    roles: [
      "MASTER",
      "PPIC",
      "PRODUCTION",
      "ADMIN",
      "FINANCE",
      "MANAGER",
      "HSSE",
      "ADMIN_SHIPPING",
      "SHIPPING",
    ],
    steps: [
      {
        title: "Buka Dashboard",
        detail: "Ini adalah menu pertama.",
      },
      {
        title: "Mulai dari Needs attention",
        detail:
          "Bagian ini menunjukkan work detail yang terlambat, pekerjaan yang siap di-invoice, dan pekerjaan yang sudah di-invoice tetapi belum dibayar. Angka-angka ini tidak berubah karena filter.",
      },
      {
        title: "Pakai filter Vessel dan Month",
        detail:
          "Filter hanya mengubah Work orders, Work details, dan Work to payment. Projects dan Vessels tidak berubah.",
      },
      {
        title: "Baca panel work order dan work detail",
        detail:
          "Work order dianggap selesai bila semua work detail aktifnya 100%. Work detail bisa Completed (100%), In progress (1 sampai 99), atau No progress (0). Missed deadline berarti belum selesai dan sudah lewat target close date.",
      },
      {
        title: "Baca Work to payment",
        detail:
          "Bagian ini mengikuti pekerjaan mulai dari belum masuk BASTP, menunggu verifikasi, siap di-invoice, sampai sudah di-invoice (belum dibayar dan sudah dibayar).",
      },
      {
        title: "Telusuri bagian Vessels",
        detail:
          "Cari berdasarkan nama, tipe, atau perusahaan, tampilkan hanya kapal yang punya alert, dan urutkan berdasarkan nama, aktivitas, progres, atau jumlah work order.",
      },
      {
        title: "Buka halaman Alerts untuk rincian",
        detail:
          "Item yang terlambat berprioritas tinggi. Item Ready to invoice berprioritas sedang. Setiap daftar menampilkan 10 item per halaman.",
      },
    ],
    tips: [
      "Work detail yang dibatalkan tidak ikut dihitung di semua angka.",
      "Item yang selesai terlambat dinilai dari actual close date, atau tanggal laporan terakhirnya, dibandingkan dengan targetnya.",
    ],
    openIn: { label: "Buka dashboard", href: "/" },
    related: ["sign-in-and-menu"],
  },
];
