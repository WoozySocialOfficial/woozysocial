import { BrandProfileContent } from "../../components/BrandProfileContent";
import "./ClientBrandProfile.css";

export const ClientBrandProfile = () => {
  return (
    <div className="client-brand-profile-page">
      <div className="client-brand-profile-header">
        <h1>Brand Profile</h1>
        <p>View and edit your brand's profile information. Changes are shared with your admin team.</p>
      </div>

      <BrandProfileContent />
    </div>
  );
};
