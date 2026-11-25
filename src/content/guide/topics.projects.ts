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
        detail: "Projects ada di bawah Operations pada menu.",
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
      },
      {
        title: "Isi informasi kapal",
        detail: "Tanggal docking atau sandar, dan nama pemilik (owner).",
      },
      {
        title: "Jawab setiap item checklist dengan Ya atau Tidak",
        detail:
          "Ada 11 item dalam empat bagian: kondisi gas, tangki, status kapal, dan tangki bahan bakar dan oli pelumas. Jika Anda memilih Tidak, jelaskan alasannya pada kotak yang muncul.",
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
];
