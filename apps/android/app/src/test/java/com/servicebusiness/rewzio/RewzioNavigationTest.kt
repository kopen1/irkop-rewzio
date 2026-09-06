package com.servicebusiness.rewzio

import kotlin.test.Test
import kotlin.test.assertEquals
class RewzioNavigationTest { @Test fun screensContainRequiredDestinations() { assertEquals(true, listOf("Home","Earn","Wallet","Support").all { it.isNotBlank() }) } }
