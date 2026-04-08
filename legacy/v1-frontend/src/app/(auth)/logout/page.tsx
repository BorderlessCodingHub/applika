"use client"

import { handleLogout } from "@/lib/auth/authFetcher"
import { redirect } from "next/navigation"
import { useEffect } from "react"

export default function LogoutPage() {
  useEffect(() => {
    async function on() {
      await handleLogout()
      redirect("/login")
    }
    on()
  }, [])
  
  return null
}