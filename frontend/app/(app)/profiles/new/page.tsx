"use client";
import { useRouter } from "next/navigation";
import { ProfileForm } from "../_form";
import * as api from "@/lib/api";
import { useToast } from "@/lib/toast";

export default function NewProfilePage() {
  const router = useRouter();
  const { push } = useToast();
  return (
    <ProfileForm
      title="Tạo profile mới"
      initial={{ id: "", ho: "", ten: "", full_name: "", password: "", country: "VN", website: "", niche: [], payment: {}, notes: "" }}
      onSubmit={async (data) => {
        await api.createProfile(data);
        push({ type: "success", message: "Đã tạo profile." });
        router.push("/library?tab=profile");
      }}
    />
  );
}
