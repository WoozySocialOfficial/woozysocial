import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Heading,
  Text,
  Link,
  Button,
  VStack,
  useToast,
  Avatar,
  Wrap,
  WrapItem,
  Tooltip
} from "@chakra-ui/react";
import {
  FaLink,
  FaFacebookF,
  FaXTwitter,
  FaInstagram,
  FaLinkedinIn,
  FaPinterest,
  FaYoutube,
  FaTiktok
} from "react-icons/fa6";
import { baseURL } from "../utils/constants";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";

const socialIcons = {
  facebook: FaFacebookF,
  twitter: FaXTwitter,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  tiktok: FaTiktok,
  pinterest: FaPinterest,
  youtube: FaYoutube
};

const socialColors = {
  facebook: "#1877F2",
  twitter: "#1DA1F2",
  instagram: "#E4405F",
  linkedin: "#0A66C2",
  tiktok: "#000000",
  pinterest: "#BD081C",
  youtube: "#FF0000"
};

const RightSideNav = () => {
  const toast = useToast();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [activeAccounts, setActiveAccounts] = useState([]);

  const fetchActiveAccounts = useCallback(async () => {
    if (!user || !activeWorkspace) return;

    try {
      const response = await fetch(`${baseURL}/api/user-accounts?workspaceId=${activeWorkspace.id}`);
      if (response.ok) {
        const data = await response.json();
        // Handle both old format and new format (data.data.accounts)
        const responseData = data.data || data;
        setActiveAccounts(responseData.activeSocialAccounts || responseData.accounts || []);
      } else {
        throw new Error("Failed to fetch active accounts");
      }
    } catch (error) {
      console.error("Error fetching active accounts:", error);
      toast({
        title: "An error occurred.",
        description: "Unable to fetch active social accounts.",
        status: "error",
        duration: 3000,
        isClosable: true
      });
    }
  }, [toast, user, activeWorkspace]);

  useEffect(() => {
    fetchActiveAccounts();
  }, [fetchActiveAccounts]);

  // Listen for social accounts updates from other components
  useEffect(() => {
    const handleAccountsUpdated = () => {
      fetchActiveAccounts();
    };
    window.addEventListener('socialAccountsUpdated', handleAccountsUpdated);
    return () => window.removeEventListener('socialAccountsUpdated', handleAccountsUpdated);
  }, [fetchActiveAccounts]);

  const handleLinkSocialAccounts = async () => {
    if (!user || !activeWorkspace) return;

    try {
      const response = await fetch(`${baseURL}/api/generate-jwt?userId=${user.id}&workspaceId=${activeWorkspace.id}`);
      if (response.ok) {
        const data = await response.json();
        const url = data.data?.url || data.url;

        if (!url) {
          throw new Error("No linking URL returned from server");
        }

        const width = 800;
        const height = 800;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const popup = window.open(
          url,
          "LinkSocialAccounts",
          `toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=${width}, height=${height}, top=${top}, left=${left}`
        );

        const poll = setInterval(async () => {
          if (popup && popup.closed) {
            clearInterval(poll);
            await fetchActiveAccounts();
            window.dispatchEvent(new CustomEvent('socialAccountsUpdated'));
          }
        }, 500);
      } else {
        throw new Error("Failed to generate JWT URL");
      }
    } catch (error) {
      console.error("Error linking social accounts:", error);
      toast({
        title: "An error occurred.",
        description: "Unable to link social accounts.",
        status: "error",
        duration: 3000,
        isClosable: true
      });
    }
  };

  const handleSocialIconClick = (profileUrl) => {
    if (profileUrl) {
      window.open(profileUrl, "_blank");
    }
  };

  return (
    <VStack spacing={4} align="stretch">
      <Box bg="white" borderRadius="md" p="6" boxShadow="sm">
        <Heading as="h3" size="md" mb="4">
          Tips
        </Heading>
        <Text color="gray.600" fontSize="sm">
          • Keep your posts concise and engaging
          <br />
          • Use relevant hashtags to increase visibility
          <br />
          • Include eye-catching images when possible
          <br />
          • Schedule posts for optimal times
          <br />• Learn more at{" "}
          <Link
            href="https://woozysocial.com"
            isExternal
            color="blue.500"
            textDecoration="none"
            _hover={{ textDecoration: "underline" }}
          >
            Woozy Social
          </Link>
        </Text>
      </Box>

      <Box bg="white" borderRadius="md" p="6" boxShadow="sm">
        <Heading as="h3" size="md" mb="4">
          Linked Social Accounts
        </Heading>
        <Button
          leftIcon={<FaLink />}
          colorScheme="teal"
          onClick={handleLinkSocialAccounts}
          mb="4"
          width="100%"
        >
          Link Social Accounts
        </Button>
        {activeAccounts.length > 0 ? (
          <Wrap spacing="2">
            {activeAccounts
              .filter((account) => socialIcons[account.name.toLowerCase()])
              .map((account) => {
                const lowerCaseAccount = account.name.toLowerCase();
                const IconComponent = socialIcons[lowerCaseAccount] || FaLink;
                return (
                  <WrapItem key={account.name}>
                    <Tooltip
                      label={`View ${account.name} profile`}
                      aria-label="A tooltip"
                    >
                      <Avatar
                        icon={<IconComponent />}
                        bg={socialColors[lowerCaseAccount] || "gray.500"}
                        color="white"
                        cursor="pointer"
                        onClick={() =>
                          handleSocialIconClick(account.profileUrl)
                        }
                      />
                    </Tooltip>
                  </WrapItem>
                );
              })}
          </Wrap>
        ) : (
          <Text color="gray.600" fontSize="sm">
            No linked accounts yet.
          </Text>
        )}
      </Box>
    </VStack>
  );
};

export default RightSideNav;
