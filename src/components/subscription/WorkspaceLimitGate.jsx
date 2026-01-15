import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  VStack,
  Text,
  Button,
  Box,
  Icon,
  useDisclosure
} from '@chakra-ui/react';
import { FiLock, FiZap } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { SUBSCRIPTION_TIERS } from '../../utils/constants';

/**
 * WorkspaceLimitGate Component
 *
 * Wraps buttons/actions that create workspaces and enforces tier limits.
 * Shows upgrade modal when limit is reached.
 *
 * @param {ReactNode} children - Button or trigger element (will be cloned with onClick handler)
 * @param {Function} onAllowed - Callback to execute when workspace creation is allowed
 */
const WorkspaceLimitGate = ({ children, onAllowed }) => {
  const { subscriptionTier, canCreateNewWorkspace, workspaceLimit, tierConfig, workspaceAddOns } = useAuth();
  const { userWorkspaces } = useWorkspace();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const navigate = useNavigate();

  const currentWorkspaceCount = userWorkspaces?.length || 0;
  const canCreate = canCreateNewWorkspace(currentWorkspaceCount);

  const handleClick = () => {
    if (canCreate) {
      // User can create workspace - execute callback
      if (onAllowed) onAllowed();
    } else {
      // User hit limit - show upgrade modal
      onOpen();
    }
  };

  // Clone the child element and add our onClick handler
  const childrenWithProps = typeof children === 'function'
    ? children({ onClick: handleClick, disabled: false })
    : children && children.type
      ? { ...children, props: { ...children.props, onClick: handleClick } }
      : children;

  const getUpgradeRecommendation = () => {
    switch (subscriptionTier) {
      case SUBSCRIPTION_TIERS.FREE:
        return {
          tier: 'Solo',
          limit: 1,
          message: 'Upgrade to Solo tier to create your first workspace.'
        };
      case SUBSCRIPTION_TIERS.SOLO:
        return {
          tier: 'Pro Plus',
          limit: 4,
          message: 'Upgrade to Pro Plus tier to create up to 4 workspaces.'
        };
      case SUBSCRIPTION_TIERS.PRO:
        return {
          tier: 'Pro Plus',
          limit: 4,
          message: 'Upgrade to Pro Plus tier to create up to 4 workspaces.'
        };
      case SUBSCRIPTION_TIERS.PRO_PLUS:
        return {
          tier: 'Workspace Add-on',
          limit: workspaceLimit + 1,
          message: `You've reached your workspace limit (${workspaceLimit}). Add a Workspace Bolt for €25/month.`,
          isAddOn: true
        };
      case SUBSCRIPTION_TIERS.AGENCY:
        return {
          tier: 'Agency',
          limit: Infinity,
          message: 'You have unlimited workspaces.',
          unlimited: true
        };
      default:
        return {
          tier: 'Pro Plus',
          limit: 4,
          message: 'Upgrade to create more workspaces.'
        };
    }
  };

  const upgradeInfo = getUpgradeRecommendation();

  return (
    <>
      {childrenWithProps}

      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Icon as={FiLock} mr={2} color="blue.500" />
            Workspace Limit Reached
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="start">
              <Box>
                <Text fontWeight="semibold" mb={2}>
                  Current Plan: {tierConfig.displayName}
                </Text>
                <Text fontSize="sm" color="gray.600">
                  Workspaces: {currentWorkspaceCount} / {workspaceLimit === Infinity ? '∞' : workspaceLimit}
                </Text>
                {workspaceAddOns > 0 && (
                  <Text fontSize="sm" color="gray.600">
                    Workspace Add-ons: {workspaceAddOns}
                  </Text>
                )}
              </Box>

              <Box
                bg="blue.50"
                border="1px solid"
                borderColor="blue.200"
                borderRadius="md"
                p={4}
                w="full"
              >
                <Text fontSize="sm" color="blue.800">
                  {upgradeInfo.message}
                </Text>
              </Box>

              {!upgradeInfo.unlimited && (
                <VStack spacing={2} align="start" w="full">
                  <Text fontSize="sm" fontWeight="semibold">
                    <Icon as={FiZap} mr={1} color="blue.500" />
                    {upgradeInfo.isAddOn ? 'Add Workspace Bolt' : `Upgrade to ${upgradeInfo.tier}`}
                  </Text>
                  <Text fontSize="xs" color="gray.600">
                    {upgradeInfo.isAddOn
                      ? `Each Workspace Bolt adds 1 workspace for €25/month.`
                      : `Get access to ${upgradeInfo.limit === Infinity ? 'unlimited' : upgradeInfo.limit} workspaces.`
                    }
                  </Text>
                </VStack>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={() => {
                onClose();
                navigate('/pricing');
              }}
            >
              {upgradeInfo.isAddOn ? 'Add Workspace Bolt' : 'View Plans'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default WorkspaceLimitGate;
