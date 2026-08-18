# AdvOS v9.84.7.7

Corrige a exigência falsa de selfie antes da assinatura. O backend passa a carregar selfie_path/CPF/OTP do signatário, validar e persistir a evidência da selfie antes de assinar, com recuperação pelo evento facial quando necessário.
