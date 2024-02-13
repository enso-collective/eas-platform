import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";

const ZAPIER_SECRET = process.env.ZAPIER_SECRET;


export async function POST(request: Request) {
    
    const req = await request.json()

    // Extract necessary data from the request json
    const { cast_hash, fid, attest_wallet, cast_content, cast_image_link, assoc_brand } = req;

    // Check if the request includes the correct token
    if (req.token !== ZAPIER_SECRET) {
        req.status(401).send("Invalid token");
        return;
    }
    
    // Mint an EAS
    const res = await eas_mint(cast_hash, fid, attest_wallet, cast_content, cast_image_link, assoc_brand);

    return Response.json({ res })
}

async function eas_mint(cast_hash: string, fid: string, attest_wallet: string, cast_content: string, cast_image_link: string, assoc_brand: string) {
    //push to EAS either onchain or offchain. docs: https://docs.attest.sh/docs/tutorials/make-an-attestation
    const provider = ethers.getDefaultProvider(
        "base", {
            alchemy: process.env['ALCHEMY_KEY']
        }
    );
    const privateKey = process.env['PRIVATE_KEY'];
    if (!privateKey) {
        throw new Error('PRIVATE_KEY is not defined in the environment variables');
    }
    const signer = new ethers.Wallet(privateKey, provider);
    const eas = new EAS("0x4200000000000000000000000000000000000021"); //https://docs.attest.sh/docs/quick--start/contracts#base
    eas.connect(signer);

    const ts = Date.now();
    cast_hash = cast_hash.startsWith('0x') ? cast_hash.substring(2) : cast_hash; //depending on source, sometimes hash has 0x in it.
        
    // Initialize SchemaEncoder with the schema string
    const schemaEncoder = new SchemaEncoder("uint32 timestamp, uint32 farcasterID, string castHash, string castTextContent, string castImageLink, string associatedBrand");
    const encodedData = schemaEncoder.encodeData([
        { name: "timestamp", value: ts, type: "uint32" }, //Unix timestamp in seconds
        { name: "farcasterID", value: fid, type: "uint32" }, // one of these will be null
        { name: "castHash", value: cast_hash, type: "string" }, 
        { name: "castTextContent", value: cast_content, type: "string" }, 
        { name: "castImageLink", value: cast_image_link, type: "string" },
        { name: "associatedBrand", value: assoc_brand, type: "string" },
    ]);
    console.log(encodedData)
    const SchemaUID = "0xd88b6019cbfad1a9b093f2b4dcd96e443923f3ed434ed1a01677e2558f0b1f9c";    

    const tx = await eas.attest({
        schema: SchemaUID,
        data: {
            recipient: attest_wallet,
            expirationTime: BigInt(0),
            revocable: true,
            data: encodedData
        },
    });

    const newAttestationUID = await tx.wait();
    console.log("New attestation UID:", newAttestationUID);
    console.log(tx.tx.hash)
    return tx.tx.hash;
}