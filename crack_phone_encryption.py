#!/usr/bin/env python3
"""
Script to crack the phone number encryption by finding the key.
We know: phone_1 decrypts to "(561) 833-3899"
"""

import base64
import hashlib
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
import itertools
import string

# Known plaintext/ciphertext pair
KNOWN_ENCRYPTED = "oQuCZNbrbY36bOk4SeugRA==:N7MxsiWd9Z+GJ+b3Krh9LA=="
KNOWN_PLAINTEXT = "(561) 833-3899"

def decrypt_phone(encrypted_data, key):
    """
    Decrypt a phone number using AES decryption.
    
    Args:
        encrypted_data: Base64 encoded string in format "ciphertext:iv"
        key: Encryption key (bytes)
    
    Returns:
        Decrypted string or None if decryption fails
    """
    try:
        # Split the encrypted data
        parts = encrypted_data.split(':')
        if len(parts) != 2:
            return None
        
        ciphertext_b64, iv_b64 = parts
        
        # Decode from base64
        ciphertext = base64.b64decode(ciphertext_b64)
        iv = base64.b64decode(iv_b64)
        
        # Create cipher and decrypt
        cipher = AES.new(key, AES.MODE_CBC, iv)
        decrypted_padded = cipher.decrypt(ciphertext)
        
        # Remove padding
        decrypted = unpad(decrypted_padded, AES.block_size)
        
        return decrypted.decode('utf-8')
    except Exception as e:
        return None

def try_key(key_material, target_plaintext=KNOWN_PLAINTEXT):
    """
    Try a key and see if it decrypts to the known plaintext.
    """
    # Try different key sizes
    for key_size in [16, 24, 32]:  # AES-128, AES-192, AES-256
        # If key_material is a string, encode it
        if isinstance(key_material, str):
            key_bytes = key_material.encode('utf-8')
        else:
            key_bytes = key_material
        
        # Hash to get the right key size
        if len(key_bytes) != key_size:
            key = hashlib.sha256(key_bytes).digest()[:key_size]
        else:
            key = key_bytes
        
        result = decrypt_phone(KNOWN_ENCRYPTED, key)
        if result == target_plaintext:
            return key, key_size
    
    return None, None

def brute_force_simple_keys():
    """
    Try common simple keys and patterns.
    """
    print("Trying common simple keys...")
    
    # Common passwords/keys
    common_keys = [
        "password", "secret", "key", "encryption", "phone",
        "12345678", "admin", "default", "test", "demo",
        "dealmachine", "tripsnag", "syslink",
        # Add more if you have hints about the system
    ]
    
    for key in common_keys:
        result_key, key_size = try_key(key)
        if result_key:
            print(f"✓ FOUND KEY: '{key}' (AES-{key_size*8})")
            print(f"  Key (hex): {result_key.hex()}")
            return result_key, key_size
    
    return None, None

def brute_force_numeric_keys(max_digits=8):
    """
    Try numeric keys up to a certain length.
    """
    print(f"\nTrying numeric keys up to {max_digits} digits...")
    
    for length in range(1, max_digits + 1):
        print(f"  Trying {length}-digit numbers...")
        for num in range(10**length):
            key = str(num).zfill(length)
            result_key, key_size = try_key(key)
            if result_key:
                print(f"✓ FOUND KEY: '{key}' (AES-{key_size*8})")
                print(f"  Key (hex): {result_key.hex()}")
                return result_key, key_size
    
    return None, None

def test_with_known_key(key_hex_or_str):
    """
    Test decryption with a known key (for validation).
    """
    if isinstance(key_hex_or_str, str) and all(c in string.hexdigits for c in key_hex_or_str.replace(' ', '')):
        # It's a hex string
        key = bytes.fromhex(key_hex_or_str.replace(' ', ''))
    else:
        # It's a regular string, hash it
        key = hashlib.sha256(key_hex_or_str.encode()).digest()[:32]
    
    result = decrypt_phone(KNOWN_ENCRYPTED, key)
    print(f"Decrypted: {result}")
    return result == KNOWN_PLAINTEXT

def decrypt_all_phones(key):
    """
    Once we find the key, decrypt all the phone numbers.
    """
    phone_numbers = {
        "phone_1": "oQuCZNbrbY36bOk4SeugRA==:N7MxsiWd9Z+GJ+b3Krh9LA==",
        "phone_2": "y98P0l01te4qcHxs5KnnQw==:j7GwFKKiZncRSV1NBLpZsg==",
        "original_query": "dA22/1fN/RhiuOSQIaPS2w==:aWQPJVgXAKY17AOtDd+CMg==",
    }
    
    print("\n" + "="*60)
    print("DECRYPTED PHONE NUMBERS:")
    print("="*60)
    
    for name, encrypted in phone_numbers.items():
        decrypted = decrypt_phone(encrypted, key)
        print(f"{name:20s} : {decrypted if decrypted else 'FAILED'}")
    
    print("="*60)

if __name__ == '__main__':
    print("="*60)
    print("Phone Number Encryption Cracker")
    print("="*60)
    print(f"Known encrypted: {KNOWN_ENCRYPTED}")
    print(f"Should decrypt to: {KNOWN_PLAINTEXT}")
    print("="*60)
    
    # Try to find the key
    found_key, key_size = brute_force_simple_keys()
    
    if not found_key:
        found_key, key_size = brute_force_numeric_keys(max_digits=6)
    
    if found_key:
        print("\n✓ SUCCESS! Key found.")
        print(f"Using key to decrypt all phone numbers...\n")
        decrypt_all_phones(found_key)
    else:
        print("\n✗ Could not find the key with simple brute force.")
        print("\nOptions:")
        print("1. The key might be stored in environment variables or config files")
        print("2. The key might be derived from a more complex pattern")
        print("3. Try providing a hint about where the key might be stored")
        print("\nYou can also test a specific key by running:")
        print("  python crack_phone_encryption.py --test-key 'your_key_here'")

