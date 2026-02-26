import { useWorkspace } from '../../contexts/WorkspaceContext';
import { Box, VStack, Text, Icon } from '@chakra-ui/react';
import { FiLock } from 'react-icons/fi';

/**
 * RoleGuard Component
 *
 * Conditionally renders children based on user's role permissions.
 * Can check for specific permissions or required roles.
 *
 * @param {string} permission - Permission name to check (e.g., 'canManageTeam')
 * @param {string[]} allowedRoles - Array of roles allowed to access (e.g., ['owner', 'member'])
 * @param {ReactNode} children - Content to render if permission is granted
 * @param {string} fallbackType - Type of fallback: 'hide' | 'message' | 'disabled'
 * @param {string} fallbackMessage - Custom message when access is denied
 */
const RoleGuard = ({
  permission = null,
  allowedRoles = null,
  children,
  fallbackType = 'hide',
  fallbackMessage = 'You do not have permission to access this feature.'
}) => {
  const { userRole, hasRolePermission } = useWorkspace();

  // Determine if user has access
  let hasAccess = false;

  if (permission) {
    // Check specific permission
    hasAccess = hasRolePermission(permission);
  } else if (allowedRoles && allowedRoles.length > 0) {
    // Check if user's role is in allowed roles
    hasAccess = allowedRoles.includes(userRole);
  } else {
    // No restrictions specified, allow access
    hasAccess = true;
  }

  // If user has access, render children normally
  if (hasAccess) {
    return <>{children}</>;
  }

  // If fallbackType is 'hide', don't render anything
  if (fallbackType === 'hide') {
    return null;
  }

  // If fallbackType is 'message', show access denied message
  if (fallbackType === 'message') {
    return (
      <Box
        bg="gray.50"
        border="1px solid"
        borderColor="gray.200"
        borderRadius="md"
        p={4}
        textAlign="center"
      >
        <VStack spacing={2}>
          <Icon as={FiLock} boxSize={6} color="gray.400" />
          <Text fontSize="sm" color="gray.600">
            {fallbackMessage}
          </Text>
        </VStack>
      </Box>
    );
  }

  // If fallbackType is 'disabled', render children but disabled
  if (fallbackType === 'disabled') {
    return (
      <Box opacity={0.5} pointerEvents="none" cursor="not-allowed">
        {children}
      </Box>
    );
  }

  return null;
};

export default RoleGuard;
