package com.servicebusiness.rewzio.core.api

interface ApiResultMapper { fun message(code: Int): String }
class DefaultApiResultMapper : ApiResultMapper { override fun message(code: Int) = when (code) { 401 -> "Sesi berakhir"; 403 -> "Tidak diizinkan"; 408 -> "Waktu habis"; 429 -> "Terlalu banyak permintaan"; in 500..599 -> "Server sedang bermasalah"; else -> "Terjadi kesalahan" } }
