import { redirect } from "next/navigation";
import { getAdminSession } from "../lib/auth";
import AdminShell from "../components/admin-shell";
export default async function Home(){const s=await getAdminSession();if(!s)redirect("/login");return <AdminShell role={s.role} email={s.email}/>}
