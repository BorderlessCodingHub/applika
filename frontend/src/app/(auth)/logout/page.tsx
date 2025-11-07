"use client"

import { logout } from "@/lib/auth/authFetcher"
import { redirect } from "next/navigation"
import { useEffect } from "react"

export default function LogoutPage() {
  useEffect(() => {
    async function handleLogout() {
      await logout()
      redirect("/login")
    }
    handleLogout()
  }, [])
  
  return null
}