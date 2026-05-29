"use client";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ProfileForm } from "../_form";
import * as api from "@/lib/api";
import { useToast } from "@/lib/toast";

export default function EditProfilePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { push } = useToast();
  const q = useQuery({ queryKey: ["profile", id], queryFn: () => api.getProfile(id) });

  if (q.isLoading) return <div className="text-gray-500">Đang tải...</div>;
  if (!q.data) return <div className="text-red-500">Không tìm thấy profile.</div>;

  return (
    <ProfileForm
      title={`Sửa profile · ${q.data.id}`}
      lockId
      initial={q.data}
      onSubmit={async (data) => {
        await api.updateProfile(id, data);
        push({ type: "success", message: "Đã lưu profile." });
        router.push("/library?tab=profile");
      }}
    />
  );
}
