// src/common/crypto.rs
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey, PUBLIC_KEY_LENGTH};
use rand::rngs::OsRng;
use crate::error::{AppError, Result};

// Key prefixes are not used in bs58 check version encoding, but can be good for human-readability
// if you were to implement your own scheme. For now, we rely on the version byte.

/// Represents an Ed25519 key pair.
pub struct KeyPair {
    pub signing_key: SigningKey,
}

impl KeyPair {
    /// Generates a new random key pair.
    pub fn new() -> Self {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        Self { signing_key }
    }

    /// Signs a message with the private key.
    pub fn sign(&self, message: &[u8]) -> Signature {
        self.signing_key.sign(message)
    }

    /// Exports the private key to a Base58Check encoded string with version byte 0.
    pub fn private_key_to_bs58(&self) -> String {
        // FIX: This method now compiles due to the "check" feature in Cargo.toml
        bs58::encode(self.signing_key.to_bytes()) // <--- THE PROBLEM IS HERE
            .with_check_version(0)
            .into_string()
    }

    /// Exports the public key to a Base58Check encoded string with version byte 1.
    pub fn public_key_to_bs58(&self) -> String {
        // FIX: This method now compiles due to the "check" feature in Cargo.toml
        bs58::encode(self.signing_key.verifying_key().to_bytes()).with_check_version(1).into_string()
    }
}

/// Verifies a signature against a message using a Base58Check-encoded public key.
pub fn verify_signature(public_key_bs58: &str, message: &[u8], signature: &[u8]) -> Result<()> {
    // FIX (E0308, E0277): The entire verification logic is rewritten for correctness.
    
    // 1. Decode the base58 string, checking for version byte 1 (for public keys) and validating the checksum.
    let pub_key_bytes_vec = bs58::decode(public_key_bs58)
        .with_check(Some(1))
        .into_vec()
        .map_err(|e| AppError::AuthError(format!("Invalid public key format or checksum: {}", e)))?;

    // 2. Try to convert the resulting Vec<u8> into a fixed-size array for the verifying key.
    if pub_key_bytes_vec.len() != 33 || pub_key_bytes_vec[0] != 1 {
        return Err(AppError::AuthError(
            "Invalid public key version or length".to_string(),
        ));
    }

    let pub_key_data = &pub_key_bytes_vec[1..];
    let pub_key_array: &[u8; ed25519_dalek::PUBLIC_KEY_LENGTH] = pub_key_data
        .try_into()
        .map_err(|_| AppError::AuthError("Invalid public key length".to_string()))?;

    // 3. Create a VerifyingKey from the byte array. Map the specific crypto error to our AppError.
    let verifying_key = VerifyingKey::from_bytes(pub_key_array)
        .map_err(|e| AppError::AuthError(format!("Invalid public key bytes: {}", e)))?;
    
    // 4. Create a Signature from the signature slice. Map the error.
    let signature = Signature::from_slice(signature)
        .map_err(|_| AppError::AuthError("Invalid signature format".to_string()))?;

    // 5. Perform the verification. Map the error.
    verifying_key.verify(message, &signature)
        .map_err(|_| AppError::AuthError("Signature verification failed".to_string()))?;

    Ok(())
}
