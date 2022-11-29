// sample jwts for local testing based on the keys above
export const userJwt = `eyJhbGciOiJSUzI1NiJ9.eyJpYXQiOjE2MTk4MjU1NjUsImV4cCI6MTcwMTMwODc4MCwic3ViIjoiNDlmZWEyZDMtYmE0MS00OGQ5LWFjMjgtMDUxN2RhYzMwOWEyIiwiaXNzIjoiZWdvIiwianRpIjoiOGE2YzIwMWYtMzBmOS00ZmU5LTkzNjItNzdkOGZlMmZkYTk2IiwiY29udGV4dCI6eyJzY29wZSI6WyIqLkRFTlkiXSwidXNlciI6eyJlbWFpbCI6ImFwcGxpY2FudEBvaWNyLm9uLmNhIiwic3RhdHVzIjoiQVBQUk9WRUQiLCJmaXJzdE5hbWUiOiJhcHBsaSIsImxhc3ROYW1lIjoiY2FudCIsImNyZWF0ZWRBdCI6MTU4MzM0MjI5MTc0NSwibGFzdExvZ2luIjoxNjE5ODI1NTY1NjUxLCJwcmVmZXJyZWRMYW5ndWFnZSI6IkVOR0xJU0giLCJ0eXBlIjoiVVNFUiIsInByb3ZpZGVyVHlwZSI6IkdPT0dMRSIsInByb3ZpZGVyU3ViamVjdElkIjoiYXBwbGljYW50MTIzNCIsImdyb3VwcyI6WyI2NTI0Il19fSwiYXVkIjpbXX0.QBXpq0954YPnX4HUsRblBfaR0eY0HvprBN72IDPq3oaqHA2iG8cmjXMP-bj3KQPDdVbMaoCj7DRik7Zff-rvTrPAY_epjVqz8VOdd_fAhcXMj4b4MC3Zuc2-0l8Q8uXWHvUfERBW58XIF-IYCLsVHuopkn3s4YmRl7VM0dbqHr5c4Fv9gMSZP3oiD3zlpix-7WpQ2RSMfjQMul6rEDyt113q5t4OLV8d85Z9zUo4sfbhdoVig59IA9Y_9FDuVf274phfzF8v1IIs8prDcQqbNzqQ1fEqsZNEPuZ5x29cy8oMCTBXTboD_UdDvTFm1CouuUHXMFMPOuNERSl5qKu32A`;
export const reviewerJwt = `eyJhbGciOiJSUzI1NiJ9.eyJpYXQiOjE2MTk4MjU1NjUsImV4cCI6MTcwMTMwODc4MCwic3ViIjoiYWRtaW4xMjM0NSIsImlzcyI6ImVnbyIsImp0aSI6IjhhNmMyMDFmLTMwZjktNGZlOS05MzYyLTc3ZDhmZTJmZGE5NiIsImNvbnRleHQiOnsic2NvcGUiOlsiREFDTy1SRVZJRVcuV1JJVEUiXSwidXNlciI6eyJlbWFpbCI6ImJhbGxhYmFkaUBvaWNyLm9uLmNhIiwic3RhdHVzIjoiQVBQUk9WRUQiLCJmaXJzdE5hbWUiOiJCYXNoYXIiLCJsYXN0TmFtZSI6IkFsbGFiYWRpIiwiY3JlYXRlZEF0IjoxNTgzMzQyMjkxNzQ1LCJsYXN0TG9naW4iOjE2MTk4MjU1NjU2NTEsInByZWZlcnJlZExhbmd1YWdlIjoiRlJFTkNIIiwicHJvdmlkZXJUeXBlIjoiR09PR0xFIiwicHJvdmlkZXJTdWJqZWN0SWQiOiJnb29nbGUxMjIzMzQiLCJ0eXBlIjoiQURNSU4iLCJncm91cHMiOlsiNjUyNCJdfX0sImF1ZCI6W119.a_tqb1f3-U0WtIMG1y9PJvjvoZECgJjg-7Jid77eqMXaXDSd3QqVuVY5a34bEgD63VDLBabJTHc5-QdvYgm2QdDCxVV7hrgOduL8nRaD4J5-V8AKfjlLFf8YwRtrmUAN2EI0VEAWP81sNFcF8pxvaxr4GCK7ozIzbF07VGkL9CSbO649U51kXbjl122KjonMnycO2ltmnjwQVv-kDEEJejeYKjQDyV3D5wBLHI3Br_6moYry3kfScdp5KxnZzAdQIVZFZt68T5kifOgUtIpd9v4T4hlisc60EMhtoGI97XenymwaTJiudKmjKKsuGVDNcCJEqXZ6AeWtjP1sMlIDyw`;
export const systemJwt = `eyJraWQiOiIyODc5Y2FiOC0zNWFiLTRlMDgtYmYzZS1kNzY4ZTcyYThiM2YiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIwMDA5OTgiLCJuYmYiOjE2NjkyMjMxNTgsInNjb3BlIjpbIkRBQ08tU1lTVEVNLldSSVRFIiwiREFDTy1SRVZJRVcuV1JJVEUiXSwiaXNzIjoiZWdvIiwiY29udGV4dCI6eyJzY29wZSI6WyJEQUNPLVJFVklFVy5SRUFEIiwiREFDTy1TWVNURU0uV1JJVEUiLCJEQUNPLVJFVklFVy5XUklURSIsIkRBQ08tU1lTVEVNLlJFQUQiXSwiYXBwbGljYXRpb24iOnsibmFtZSI6IkRBQy1BUFAiLCJjbGllbnRJZCI6ImRhYy1hcHAiLCJyZWRpcmVjdFVyaSI6InJlZGlyZWN0Iiwic3RhdHVzIjoiQVBQUk9WRUQiLCJlcnJvclJlZGlyZWN0VXJpIjoiZXJyb3IiLCJ0eXBlIjoiQ0xJRU5UIn19LCJleHAiOjE3MDEzMDg3ODAsImlhdCI6MTY2OTIyMzE1OCwianRpIjoiMTRiNzk2ODEtYWM0YS00ZTViLTk0NTktMGZjNjA5NWFjY2NkIn0.Nh-I9vHMYrI_9f4DPhw2M9crABYIA9lFqs5YaLvssc0uUP162DAnExwjmv4qYUCZytYAfaxVdb6fAodYDh7_oR_NAUbyBSwiabD1UfbGjDyH89vr_A0Sz02X5ZJfjzG-FetcEVSfbm9Io0Vp7dXqeIV0pXAYDrOx1OXNT7Jm_npwtYj08rqmolya5q-wcxjiL0CU383w4OFj-21Gxa172C4kQ21xojHV2UeXsy2TRxf5PtOs76VOo9gpPINwq6jRSr8HEy_jaR03ItpKJRDR25ArsNRphzc5g8GSBBG4_x4fWb0tyrxWzi8v2AdFzty8yi6lb67AZD0mU63I5h26fg`;

export const TEST_PUB_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnzyis1ZjfNB0bBgKFMSv
vkTtwlvBsaJq7S5wA+kzeVOVpVWwkWdVha4s38XM/pa/yr47av7+z3VTmvDRyAHc
aT92whREFpLv9cj5lTeJSibyr/Mrm/YtjCZVWgaOYIhwrXwKLqPr/11inWsAkfIy
tvHWTxZYEcXLgAXFuUuaS3uF9gEiNQwzGTU1v0FqkqTBr4B8nW3HCN47XUu0t8Y0
e+lf4s4OxQawWD79J9/5d3Ry0vbV3Am1FtGJiJvOwRsIfVChDpYStTcHTCMqtvWb
V6L11BWkpzGXSW4Hv43qa+GSYOD2QU68Mb59oSk2OB+BtOLpJofmbGEGgvmwyCI9
MwIDAQAB
-----END PUBLIC KEY-----`;

// test private key used to generate tokens for tests
export const TEST_PRIV_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEAnzyis1ZjfNB0bBgKFMSvvkTtwlvBsaJq7S5wA+kzeVOVpVWw
kWdVha4s38XM/pa/yr47av7+z3VTmvDRyAHcaT92whREFpLv9cj5lTeJSibyr/Mr
m/YtjCZVWgaOYIhwrXwKLqPr/11inWsAkfIytvHWTxZYEcXLgAXFuUuaS3uF9gEi
NQwzGTU1v0FqkqTBr4B8nW3HCN47XUu0t8Y0e+lf4s4OxQawWD79J9/5d3Ry0vbV
3Am1FtGJiJvOwRsIfVChDpYStTcHTCMqtvWbV6L11BWkpzGXSW4Hv43qa+GSYOD2
QU68Mb59oSk2OB+BtOLpJofmbGEGgvmwyCI9MwIDAQABAoIBACiARq2wkltjtcjs
kFvZ7w1JAORHbEufEO1Eu27zOIlqbgyAcAl7q+/1bip4Z/x1IVES84/yTaM8p0go
amMhvgry/mS8vNi1BN2SAZEnb/7xSxbflb70bX9RHLJqKnp5GZe2jexw+wyXlwaM
+bclUCrh9e1ltH7IvUrRrQnFJfh+is1fRon9Co9Li0GwoN0x0byrrngU8Ak3Y6D9
D8GjQA4Elm94ST3izJv8iCOLSDBmzsPsXfcCUZfmTfZ5DbUDMbMxRnSo3nQeoKGC
0Lj9FkWcfmLcpGlSXTO+Ww1L7EGq+PT3NtRae1FZPwjddQ1/4V905kyQFLamAA5Y
lSpE2wkCgYEAy1OPLQcZt4NQnQzPz2SBJqQN2P5u3vXl+zNVKP8w4eBv0vWuJJF+
hkGNnSxXQrTkvDOIUddSKOzHHgSg4nY6K02ecyT0PPm/UZvtRpWrnBjcEVtHEJNp
bU9pLD5iZ0J9sbzPU/LxPmuAP2Bs8JmTn6aFRspFrP7W0s1Nmk2jsm0CgYEAyH0X
+jpoqxj4efZfkUrg5GbSEhf+dZglf0tTOA5bVg8IYwtmNk/pniLG/zI7c+GlTc9B
BwfMr59EzBq/eFMI7+LgXaVUsM/sS4Ry+yeK6SJx/otIMWtDfqxsLD8CPMCRvecC
2Pip4uSgrl0MOebl9XKp57GoaUWRWRHqwV4Y6h8CgYAZhI4mh4qZtnhKjY4TKDjx
QYufXSdLAi9v3FxmvchDwOgn4L+PRVdMwDNms2bsL0m5uPn104EzM6w1vzz1zwKz
5pTpPI0OjgWN13Tq8+PKvm/4Ga2MjgOgPWQkslulO/oMcXbPwWC3hcRdr9tcQtn9
Imf9n2spL/6EDFId+Hp/7QKBgAqlWdiXsWckdE1Fn91/NGHsc8syKvjjk1onDcw0
NvVi5vcba9oGdElJX3e9mxqUKMrw7msJJv1MX8LWyMQC5L6YNYHDfbPF1q5L4i8j
8mRex97UVokJQRRA452V2vCO6S5ETgpnad36de3MUxHgCOX3qL382Qx9/THVmbma
3YfRAoGAUxL/Eu5yvMK8SAt/dJK6FedngcM3JEFNplmtLYVLWhkIlNRGDwkg3I5K
y18Ae9n7dHVueyslrb6weq7dTkYDi3iOYRW8HRkIQh06wEdbxt0shTzAJvvCQfrB
jg/3747WSsf/zBTcHihTRBdAv6OmdhV4/dD5YBfLAkLrd+mX7iE=
-----END RSA PRIVATE KEY-----`;
