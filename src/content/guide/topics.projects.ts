import type { GuideTopic } from "./types";

export const projectTopics: GuideTopic[] = [
  {
    id: "project-create",
    title: "Membuat project",
    summary: "Buka sebuah project untuk satu kejadian docking sebuah kapal.",
    group: "projects",
    roles: ["MASTER", "PPIC", "PRODUCTION", "ADMIN", "ADMIN_SHIPPING"],
    before:
      "Project adalah satu kejadian docking untuk satu kapal. Work order berada di dalamnya. Project dari docking plan yang disetujui dibuat dengan mengonversi plan-nya.",
    steps: [
      {
        title: "Buka Projects lalu tekan New project",
        detail: "Projects ada di menu, tepat di bawah Dashboard.",
      },
      {
        title: "Pilih kapal",
        detail: "Anda bisa mencari berdasarkan nama, tipe, atau perusahaan.",
      },
      {
        title: "Pilih jenis docking",
        detail: "Docking, Docking - IS, Docking - AS, Docking - SS, Repair, atau New Building.",
      },
      {
        title: "Periksa nama project",
        detail:
          "Nama terisi dengan pola PERUSAHAAN-KAPAL-jenis docking-tahun-nomor. Anda boleh mengetik nama sendiri. Setelah itu, mengubah kapal atau jenis docking tidak lagi menimpa nama Anda.",
      },
      {
        title: "Simpan",
        detail: "Anda masuk ke halaman project.",
      },
    ],
    tips: [
      "Anda juga bisa membuat project saat menambah work order, lewat tautan New Project.",
      "Rename mengubah nama dari kapal dan jenis docking. Memilih kapal lain akan memindahkan seluruh project, dan itu diblokir bila ada work detail-nya yang sudah masuk BASTP.",
      "Assign existing work order memasukkan work order dari kapal yang sama yang belum punya project.",
    ],
    problems: [
      {
        problem: "Saya tidak melihat tombol New project.",
        fix: "Manager, HSSE, dan Shipping hanya bisa melihat project (Shipping hanya mengerjakan docking plan).",
      },
      {
        problem: "Rename menyebut nama sudah dipakai.",
        fix: "Project lain memakai nama yang sama. Ubah kapal atau jenis docking.",
      },
    ],
    openIn: { label: "Buka Projects", href: "/projects" },
    related: ["readiness-fill", "wo-create"],
  },
  {
    id: "readiness-fill",
    title: "Mengisi form kesiapan kapal",
    summary: "Tunjukkan bahwa kapal aman masuk ke shipyard, agar HSSE bisa menyetujuinya.",
    group: "projects",
    roles: ["PPIC", "MASTER", "ADMIN_SHIPPING", "SHIPPING"],
    before:
      "Project sudah ada. Shipping hanya bisa mengisi form untuk project yang berasal dari docking plan miliknya sendiri.",
    steps: [
      {
        title: "Buka project lalu tekan Start readiness form",
        detail:
          "Shipping membukanya dari plan yang sudah dikonversi dengan tautan Open the readiness form.",
        image: {
          src: "/guide/plan-converted.png",
          alt: "Halaman plan yang sudah dikonversi. Tulisan 'This plan is now a live project' berisi tautan Open the project dan Open the readiness form.",
        },
      },
      {
        title: "Isi informasi kapal",
        detail: "Tanggal docking atau sandar, dan nama pemilik (owner).",
        image: {
          src: "/guide/readiness-form-empty.png",
          alt: "Form kesiapan kapal yang masih kosong, dimulai dengan bagian Vessel Information, lalu bagian checklist dengan tombol Ya dan Tidak.",
        },
      },
      {
        title: "Jawab setiap item checklist dengan Ya atau Tidak",
        detail:
          "Ada 11 item dalam empat bagian: kondisi gas, tangki, status kapal, dan tangki bahan bakar dan oli pelumas. Jika Anda memilih Tidak, jelaskan alasannya pada kotak yang muncul.",
        image: {
          src: "/guide/readiness-form-filled.png",
          alt: "Form kesiapan yang sudah terisi: setiap item checklist dijawab Ya (hijau), dan tombol biru Submit for HSSE Review di bagian bawah.",
        },
      },
      {
        title: "Tulis muatan terakhir kapal",
        detail: "Pakai kolom teks bebas di bawah Additional information.",
      },
      {
        title: "Simpan form, lalu unggah hasil gas test",
        detail:
          "Unggahan (form FR-02-01) muncul setelah penyimpanan pertama. PDF, JPG, atau PNG, maksimal 10 MB. Tidak wajib untuk submit, tetapi antrean menandainya sebagai belum ada.",
      },
      {
        title: "Submit",
        detail:
          "Bila setiap item terjawab, form menjadi Awaiting HSSE review. Jika tidak, tetap Draft.",
        image: {
          src: "/guide/readiness-form-submitted.png",
          alt: "Form kesiapan setelah di-submit, dengan tulisan Status: Awaiting HSSE Review dan pesan bahwa form menunggu tinjauan HSSE.",
        },
      },
      {
        title: "Jika HSSE mengembalikannya, perbarui lalu submit lagi",
        detail:
          "Baca catatan HSSE, koordinasikan dengan pemilik kapal, perbaiki jawabannya, lalu submit. HSSE meninjau seluruh daftar lagi.",
      },
    ],
    tips: [
      "Sebelum form berstatus Approved, original work order project tidak bisa dibuat.",
      "Project hasil konversi docking plan sudah punya work order. Form kesiapannya tetap harus disetujui.",
    ],
    problems: [
      {
        problem: "Saya Shipping dan tidak bisa mengisi form kesiapan sebuah project.",
        fix: "Shipping hanya bisa mengisi form untuk project yang berasal dari docking plan miliknya. Untuk project lain Anda bisa membuka form dan membacanya saja. Minta PPIC mengisinya.",
      },
    ],
    openIn: { label: "Buka Projects", href: "/projects" },
    related: ["readiness-review", "wo-create"],
  },
  {
    id: "readiness-review",
    title: "Meninjau form kesiapan dan menandatanganinya",
    summary: "Setujui atau tolak setiap item checklist, lalu tanda tangani form.",
    group: "projects",
    roles: ["HSSE", "MASTER"],
    before: "Form berstatus Awaiting HSSE review.",
    steps: [
      {
        title: "Buka Readiness Queue",
        detail:
          "Menu ini ada di bawah Approvals & Review. Filter bawaannya, Awaiting your review, menampilkan yang menunggu.",
        image: {
          src: "/guide/readiness-queue.png",
          alt: "Halaman Readiness Review Queue dengan filter Awaiting your review dan satu kartu form berisi tombol biru Review.",
        },
      },
      {
        title: "Buka sebuah form lalu tekan Review",
        detail:
          "Kartu juga menunjukkan sudah berapa lama form di-submit dan menandai hasil gas test yang belum ada.",
      },
      {
        title: "Approve atau Reject setiap item",
        detail:
          "Setiap item butuh keputusan. Item yang ditolak butuh catatan yang menjelaskan apa yang perlu diklarifikasi.",
        image: {
          src: "/guide/readiness-review.png",
          alt: "Form kesiapan yang sedang ditinjau HSSE. Di bawah setiap jawaban ada kotak HSSE Review dengan tombol Approve dan Reject.",
        },
      },
      {
        title: "Jika ada yang ditolak, tekan Send Back for Clarification",
        detail:
          "Form menjadi Needs clarification dan pengisi berkoordinasi dengan pemilik kapal.",
      },
      {
        title: "Jika semuanya disetujui, tanda tangani",
        detail:
          "Isi nama dan tanggal Anda (tidak boleh di masa depan) lalu tekan Approve & Sign Off. Form menjadi Approved.",
        image: {
          src: "/guide/readiness-review-signoff.png",
          alt: "Form kesiapan dengan semua item disetujui. Di bagian HSSE Sign-off sudah ada nama dan tanggal, dan tombol Approve & Sign Off berwarna biru di bagian bawah.",
        },
      },
      {
        title: "Periksa hasilnya",
        detail:
          "Form menampilkan Status: Approved dan tulisan bahwa project boleh melanjutkan ke work order.",
        image: {
          src: "/guide/readiness-approved.png",
          alt: "Form kesiapan dengan tulisan Status: Approved, pesan bahwa form sudah disetujui penuh oleh HSSE, dan setiap item bertanda Approved.",
        },
      },
    ],
    tips: [
      "Setelah pengajuan ulang, setiap item kembali Pending, jadi tinjau seluruh daftar.",
      "Anda bisa mengunggah atau mengganti dokumen gas test kapan saja, bahkan setelah disetujui.",
      "Project lalu menampilkan HSSE · Approved pada kolom Checked by.",
    ],
    openIn: { label: "Buka Readiness Queue", href: "/readiness-queue" },
    related: ["readiness-fill", "plan-follow"],
  },
  {
    id: "new-building-track",
    title: "Memantau kapal new building",
    summary: "Lihat kapal yang dibangun di shipyard beserta project, work order, dan perkembangannya di satu tempat.",
    group: "projects",
    roles: [
      "MASTER",
      "PPIC",
      "PRODUCTION",
      "SHIPPING",
      "ADMIN",
      "MANAGER",
      "HSSE",
      "ADMIN_SHIPPING",
    ],
    before:
      "Halaman ini hanya menampilkan pekerjaan berjenis New Building. Project dan work order dibuat seperti biasa, dengan jenis New Building.",
    steps: [
      {
        title: "Buka New Building di menu",
        detail: "Menunya ada di grup New Building, di sebelah kiri.",
      },
      {
        title: "Baca ringkasan di bagian atas",
        detail:
          "Ada jumlah kapal, jumlah work order, persentase work detail yang selesai, jumlah yang sudah lewat target close date, dan jumlah yang siap di-invoice.",
      },
      {
        title: "Cari kapal atau pilih status",
        detail:
          "Kotak pencarian mencari nama kapal, perusahaan, nama project, atau nomor work order. Chip status memisahkan In progress, Not started, dan Completed.",
      },
      {
        title: "Baca kartu setiap kapal",
        detail:
          "Kartu menunjukkan progres keseluruhan, work detail yang selesai, yang terlambat, dan tahap serah terima dan penagihannya (belum masuk BASTP, draft, verified, siap di-invoice, sudah di-invoice).",
      },
      {
        title: "Buka project atau work order dari kartu",
        detail:
          "Nama project membuka halaman project. Tombol Work orders membuka daftar work order kapal itu. Work order yang tidak terhubung ke project diberi tanda khusus.",
      },
      {
        title: "Pakai Work Orders, Work Details, dan Work Progress New Building",
        detail:
          "Grup New Building punya Work Orders, Work Details, dan Work Progress sendiri. Isinya hanya pekerjaan berjenis New Building. Pekerjaan Docking dan Repair ada di grup Docking & Repair. Work order baru dari daftar New Building langsung berjenis New Building.",
      },
      {
        title: "Mulai project new building baru",
        detail:
          "Tekan New building project. Formulir project terbuka dengan jenis New Building yang sudah terpilih. Tombol ini hanya ada untuk role yang boleh membuat project.",
      },
    ],
    tips: [
      "Jika kapal tidak muncul, periksa jenis (Work Type) pada work order dan jenis pada project. Keduanya harus New Building.",
      "Satu work order hanya muncul di satu grup. Work order berjenis New Building tidak muncul di Docking & Repair, dan sebaliknya.",
      "Halaman yang dibuka dari daftar (daftar work order kapal, tambah atau ubah work order, work detail, dan progress) dipakai bersama. Menu tetap menyala di grup asal Anda, dan tombol Back atau Save kembali ke daftar grup itu.",
      "Angka di halaman ini memakai aturan yang sama dengan Dashboard, jadi tidak akan berbeda.",
    ],
    problems: [
      {
        problem: "Ada work order di bagian Not linked to a project.",
        fix: "Work order itu dibuat tanpa project. Minta PPIC atau Admin menghubungkannya ke project yang benar.",
      },
    ],
    openIn: { label: "Buka New Building", href: "/new-building" },
    related: ["project-create", "wo-create"],
  },
];
